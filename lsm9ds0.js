var Board = require("johnny-five/lib/board.js");
var Emitter = require("events").EventEmitter;
var util = require("util");
var __ = require("johnny-five/lib/fn.js");
var Accelerometer = require("./accelerometer.js");
var Barometer = require("johnny-five/lib/barometer.js");
var Temperature = require("johnny-five/lib/temperature.js");
var Gyro = require("johnny-five/lib/gyro.js");

var int16 = __.int16;
var uint16 = __.uint16;
var uint24 = __.uint24;

var priv = new Map();
var activeDrivers = new Map();

var Drivers = {
  LSM9DS0: {
    ADDRESSES: {
      value: [0x1D]
    },
    REGISTER: {
      value: {
        SETUP: 0x1F,
        READ: 0x20
      }
    },
    initialize: {
      value: function(board, opts) {
        var READLENGTH = 14;
        var io = board.io;
        var address = opts.address || this.ADDRESSES[0];

        var computed = {
          accelerometer: {}
        };

        io.i2cConfig(opts);
        io.i2cWrite(address, this.REGISTER.SETUP);

        io.i2cRead(address, this.REGISTER.READ, READLENGTH, function(data) {
          console.log('here in lsm ' + data[1]);
          computed.accelerometer = {
            x: int16(data[0], data[1]),
            y: int16(data[2], data[3]),
            z: int16(data[4], data[5])
          };
        }.bind(this));
      },
    },
    identifier: {
      value: function(opts) {
        console.log('if we\'re here there\'s a problem');
        // var address = opts.address || Drivers["MPU6050"].ADDRESSES.value[0];
        // return "mpu-6050-" + address;
      }
    }
  },
};

Drivers.get = function(board, driverName, opts) {
  var drivers, driverKey, driver;

  if (!activeDrivers.has(board)) {
    activeDrivers.set(board, {});
  }

  drivers = activeDrivers.get(board);

  driverKey = Drivers[driverName].identifier.value(opts);

  if (!drivers[driverKey]) {
    driver = new Emitter();
    Object.defineProperties(driver, Drivers[driverName]);
    driver.initialize(board, opts);
    drivers[driverKey] = driver;
  }

  return drivers[driverKey];
};

Drivers.clear = function() {
  activeDrivers.clear();
};

var Controllers = {
  LSM9DS0: {
    initialize: {
      value: function(opts) {
        var state = priv.get(this);
        state.accelerometer = new Accelerometer(
          Object.assign({
            controller: "LSM9DS0",
            freq: opts.freq,
            board: this.board,
          }, opts)
        );
      }
    },
    components: {
      value: ["accelerometer"]
    },
    accelerometer: {
      get: function() {
        return priv.get(this).accelerometer;
      }
    }
  }
};

function LSM9DS0(opts) {

  if (!(this instanceof LSM9DS0)) {
    return new LSM9DS0(opts);
  }

  var controller, state;

  Board.Component.call(
    this, opts = Board.Options(opts)
  );

  if (opts.controller && typeof opts.controller === "string") {
    controller = Controllers[opts.controller.toUpperCase()];
  } else {
    controller = opts.controller;
  }

  if (controller == null) {
    controller = Controllers["LSM9DS0"];
  }

  this.freq = opts.freq || 500;

  state = {};
  priv.set(this, state);

  Object.defineProperties(this, controller);

  if (typeof this.initialize === "function") {
    this.initialize(opts);
  }

  setInterval(function() {
    this.emit("data", this);
  }.bind(this), this.freq);

  if (this.components && this.components.length > 0) {
    this.components.forEach(function(component) {
      if (!(this[component] instanceof Emitter)) {
        return;
      }

      this[component].on("change", function() {
        this.emit("change", this, component);
      }.bind(this));
    }, this);
  }
}

util.inherits(LSM9DS0, Emitter);

LSM9DS0.Drivers = Drivers;

module.exports = LSM9DS0;
