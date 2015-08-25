var five = require("johnny-five");
var Edison = require("edison-io");
var socket = require('socket.io-client')('http://lightsout-server.azurewebsites.net');
var config = require('./config');

var board = new five.Board({
  io: new Edison()
});


board.on("ready", function() {
    var light = new five.Pin(config.lightPin);
    
    light.high(); //turns the light on
    light.low(); //turns the light off
    
    socket.emit('action', "message");
});