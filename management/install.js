/*
 * Copyright 2014, Gregg Tavares.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Gregg Tavares. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
"use strict";

var config       = require('../lib/config');
var fs           = require('fs');
var gameDB       = require('../lib/gamedb');
var gameInfo     = require('../lib/gameinfo');
var games        = require('../lib/games');
var JSZip        = require('jszip');
var mkdirp       = require('mkdirp');
var path         = require('path');
var platformInfo = require('../lib/platform-info');
var Promise      = require('promise');
var releaseUtils = require('./release-utils');
var strings      = require('../lib/strings');

/**
 * @typedef {Object} Install~Options
 * @property {boolean?} overwrite default false. Install even if
 *           already installed.
 * @property {boolean?} verbose print extra info
 * @property {boolean?} dryRun true = don't write any files or
 *           make any folders.
 */

/**
 * Installs a release.
 *
 * @param {string} releasePath path to zip file
 * @param {string?} opt_destPath path to where to install. If
 *        not provided default games path is used.
 * @param {Install~Options?} opt_options
 */
var install = function(releasePath, opt_destPath, opt_options) {
  var options = opt_options || {};
  var log = options.verbose ? console.log.bind(console) : function() {};

  return new Promise(function(resolve, reject) {

    if (!strings.endsWith(releasePath, ".zip")) {
      // ToDo: Should we handle URLs? What about ids?
      return reject("Not a .zip file");
    }

    var zip = new JSZip();
    zip.load(fs.readFileSync(releasePath));
    var entries = Object.keys(zip.files).sort().map(function(key) {
      return zip.files[key];
    });
    var runtimeInfo;
    var zipRootPath;
    var zipPackagePath;

    var packageLocations = gameInfo.getPackageLocations();
    var checkPackageLocations = function(entry) {
      var safeDirName = entry.name.replace(/\\/g, "/");
      var shortPath = safeDirName.substring(safeDirName.indexOf("/") + 1);
      for (var jj = 0; jj < packageLocations.length; ++jj) {
        var packageLocation = packageLocations[jj];
        if (shortPath === packageLocation.packagePath) {
          return entry;
        }
      }
    };

    var findPackage = function(entries) {
      for (var ii = 0; ii < entries.length; ++ii) {
        var entry = checkPackageLocations(entries[ii]);
        if (entry) {
          return entry;
        }
      }
    };

    try {
      // Find the packageInfo
      var packageEntry = findPackage(entries);
      if (!packageEntry) {
        return reject("no package.json found in " + releasePath);
      }
      zipPackagePath = packageEntry.name.replace(/\\/g, "/");
      zipRootPath = zipPackagePath.substring(0, zipPackagePath.indexOf("/"));
      runtimeInfo = gameInfo.parseGameInfo(packageEntry.asText(), packageEntry.name, zipRootPath);
    } catch (e) {
      return reject("could not parse package.json. Maybe this is not a HappyFunTimes game?");
    }

    // Check it's got the required files
    try {
      var zipPackageDir = path.dirname(zipPackagePath);
      var fileNames = entries.map(function(entry) {
        return path.relative(zipPackageDir, entry.name.replace(/[\\/]/g, path.sep)).replace(/\\/g, "/");
      });
      gameInfo.checkRequiredFiles(runtimeInfo, fileNames);
    } catch (e) {
      return reject(e);
    }

    var info = runtimeInfo.info;
    var hftInfo = info.happyFunTimes;
    var gameId = runtimeInfo.originalGameId;
    var safeGameId = releaseUtils.safeishName(gameId);
    var destBasePath;
    var exePath;

    var fileExists = {};
    entries.forEach(function(entry) {
      var filename = entry.name.replace(/\\/g, "/").replace(/.*?\//, "");
      fileExists[filename] = true;
    });

    // Check for more files that should exist.
    // Games that are "added" don't need this but games
    // that are "installed" do.
    log("checking gametype: " + hftInfo.gameType);
    if (hftInfo.gameType.toLowerCase() === "unity3d") {
      exePath = platformInfo.exePath;
      if (exePath) {
        exePath = strings.replaceParams(exePath, { gameId: safeGameId });
        if (!fileExists[exePath]) {
          return reject("path not found: " + exePath + "\nIs this the correct zip file for " + platformInfo.id + "?");
        }
      }
    }

    // is it already installed?
    var installedGame = gameDB.getGameById(gameId);
    if (installedGame) {
      if (!options.overwrite) {
        return reject("game " + gameId + " already installed at: " + installedGame.rootPath);
      }
      // Was it "installed" or just added?
      if (installedGame.files) {
        destBasePath = installedGame.rootPath;
      }
    }

    if (!destBasePath) {
        // make the dir after we're sure we're ready to install
        destBasePath = path.join(config.getConfig().gamesDir, safeGameId);
    }

    destBasePath = opt_destPath ? opt_destPath : destBasePath;

    // Check for bad paths
    var bad = false;
    var errors = [];
    entries.forEach(function(entry) {
      if (bad) {
        return;
      }
      var filePath = entry.name.substring(zipRootPath.length + 1);
      var destPath = path.resolve(path.join(destBasePath, filePath));
      if (destPath.substring(0, destBasePath.length) !== destBasePath) {
        errors.push("ERROR: bad zip file. Path would write outside game folder");
        bad = true;
      }
    });

    if (bad) {
      // Should delete all work here?
      return reject(errors.join("\n"));
    }

    console.log("installing to: " + destBasePath);
    if (!options.dryRun) {
      mkdirp.sync(destBasePath);
    }

    var files = [];
    entries.forEach(function(entry) {
      if (bad) {
        return;
      }
      var filePath = entry.name.substring(zipRootPath.length + 1);
      files.push(filePath);
      var destPath = path.resolve(path.join(destBasePath, filePath));
      var isDir = entry.dir;
      if (destPath.substr(-1) === "/" || destPath.substr(-1) === "\\") {
        destPath = destPath.substr(0, destPath.length - 1);
        isDir = true;
      }
      //??
      if (isDir) {
        log("mkdir  : " + destPath);
        if (!options.dryRun) {
          mkdirp.sync(destPath);
        }
      } else {
        log("install: " + entry.name + " -> " + destPath);
        if (!options.dryRun) {
          var dirPath = path.dirname(destPath);
          if (!fs.existsSync(dirPath)) {
            log("mkdir  : " + dirPath);
            mkdirp.sync(dirPath);
          }
          fs.writeFileSync(destPath, entry.asNodeBuffer());
        }
      }
    });

    if (bad) {
      // Should delete all work here?
      return reject(errors.join("\n"));
    }

    // Set the executable bit
    if (hftInfo.gameType.toLowerCase() === "unity3d") {
      exePath = platformInfo.exePath;
      if (exePath) {
        exePath = path.join(destBasePath, strings.replaceParams(exePath, { gameId: safeGameId }));
        if (!fs.existsSync(exePath)) {
          return reject("path not found: " + exePath);
        }
        log("setting chmod 643 for: " + exePath);
        fs.chmodSync(exePath, (7 << 6) | (4 << 3) | 4);
      }
    }


    log("add: " + destBasePath);
    if (!options.dryRun) {
      games.add(destBasePath, files);
    }

    if (!options.dryRun) {
      console.log("installed:" + releasePath);
    }

    resolve();
  });
};

/**
 * @typedef {Object} Uninstall~Options
 * @property {boolean?} verbose print extra info
 * @property {boolean?} dryRun true = don't write any files or
 *           make any folders.
 */

exports.install = install;

