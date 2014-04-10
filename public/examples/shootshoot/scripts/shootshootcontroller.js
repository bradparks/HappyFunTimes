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

var main = function(
    GameClient,
    AudioManager,
    Cookies,
    Input,
    Misc,
    MobileHacks,
    PlayerNameHandler,
    Touch) {
  var g_client;
  var g_audioManager;

  var globals = {
    debug: false,
  };
  Misc.applyUrlSettings(globals);

  function $(id) {
    return document.getElementById(id);
  }

  function reloadPage() {
    window.location.reload();
  }

  g_client = new GameClient({
    gameId: "shootshoot",
  });

  function showConnected() {
    $("disconnected").style.display = "none";
  }

  function showDisconnected() {
    $("disconnected").style.display = "block";
  }

  function handleScore() {
  };

  function handleDeath() {
  };

  g_client.addEventListener('score', handleScore);
  g_client.addEventListener('die', handleDeath);
  g_client.addEventListener('connect', showConnected);
  g_client.addEventListener('disconnect', showDisconnected);

  var playerNameHandler = new PlayerNameHandler(g_client, $("name"));

  var color = Misc.randCSSColor();
  g_client.sendCmd('setColor', { color: color });
  document.body.style.backgroundColor = color;

  g_audioManager = new AudioManager();

  var sendPad = function(padId, dir) {
    if (globals.debug) {
      console.log("pad: " + padId + " dir: " + Touch.dirSymbols[dir] + " (" + dir + ")");
    }
    g_client.sendCmd('pad', {pad: padId, dir: dir});
  };

  Input.setupKeyboardDPadKeys(sendPad);
  var container = $("container");
  Touch.setupVirtualDPads(container, sendPad);

  if (globals.debug) {
    var status = $("status").firstChild;
    var debugCSS = Misc.findCSSStyleRule("#debug");
    debugCSS.style.display = "block";
  }
};

// Start the main app logic.
requirejs(
  [ '../../../scripts/gameclient',
    '../../scripts/audio',
    '../../scripts/cookies',
    '../../scripts/input',
    '../../scripts/misc',
    '../../scripts/mobilehacks',
    '../../scripts/playername',
    '../../scripts/touch',
  ],
  main
);
