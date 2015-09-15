var five = require("johnny-five");
five.LSM9DS0 = require("./lsm9ds0");
var Edison = require("edison-io");
var config = require('./config');
console.log('connecting to ' + config.serverUrl + '...');
var socket = require('socket.io-client')(config.serverUrl);

var board = new five.Board({
  io: new Edison()
});


board.on("ready", function() {
   var light = new five.Led(config.lightPin);
   var accelerometer = new five.LSM9DS0({
        controller: "LSM9DS0"
   });

   accelerometer.on('data',function(err,data){
      console.log('data>' + data);
   });
   
   accelerometer.on('acceleration',function(err,data){
      console.log('xm>' + data);
   });
   
    socket.on('startGame',function(){
        console.log('game starting...');
        light.on();
    });

    
    socket.on('endGame',function(winner){
        if(socket.id == winner.id) {
            console.log('Game over. You win!');
            light.blink();
        }
        else
            console.log('Game over. You lose!');
        light.off();
    });

    setTimeout(overSpeed,5000);

    function overSpeed(){    
        socket.emit('overSpeed');
        light.off();
        console.log('over speed');
    }
});