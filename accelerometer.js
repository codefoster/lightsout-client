var Board = require("johnny-five/lib/board.js"),
  events = require("events"),
  util = require("util"),
  __ = require("johnny-five/lib/fn.js"),
  sum = __.sum,
  fma = __.fma,
  constrain = __.constrain,
  int16 = __.int16;

var priv = new Map();
var rad2deg = 180 / Math.PI;
var calibrationSize = 10;
var axes = ["x", "y", "z"];

function analogInitialize(opts, dataHandler) {
  var pins = opts.pins || [],
    state = priv.get(this),
    dataPoints = {};

  state.zeroV = opts.zeroV || this.DEFAULTS.zeroV;
  state.sensitivity = opts.sensitivity || this.DEFAULTS.sensitivity;

  pins.forEach(function(pin, index) {
    this.io.pinMode(pin, this.io.MODES.ANALOG);
    this.io.analogRead(pin, function(data) {
      var axis = axes[index];
      dataPoints[axis] = data;
      dataHandler(dataPoints);
    }.bind(this));
  }, this);
}

function analogToGravity(raw, axis) {
  var state = priv.get(this);
  var zeroV = state.zeroV;

  if (Array.isArray(zeroV) && zeroV.length > 0) {
    var axisIndex = axes.indexOf(axis);
    zeroV = zeroV[axisIndex || 0];
  }

  return (raw - zeroV) / state.sensitivity;
}

var Controllers = {
  LSM9DS0: {
    ADDRESSES: {
      value: [0x1D]
    },
    REGISTER: {
      value: {
        READREGISTER: 0x20
      }
    },
    initialize: {
      value: function(opts, dataHandler) {
        var READLENGTH = 6;
        var address = opts.address || this.ADDRESSES[0];
        var state = priv.get(this);

        this.io.i2cConfig(opts);

//         // Standby mode
//         this.io.i2cWrite(address, this.REGISTER.POWER, 0);
// 
//         // Enable measurements
//         this.io.i2cWrite(address, this.REGISTER.POWER, 8);
// 
//         // Set range (this is 2G range, should be user defined?)
//         this.io.i2cWrite(address, this.REGISTER.RANGE, 8);
        this.io.i2cRead(address, this.REGISTER.READREGISTER, READLENGTH, function(data) {
          dataHandler.call(this, {
            x: int16(data[0], data[1]),
            y: int16(data[2], data[3]),
            z: int16(data[4], data[5])
          });
        }.bind(this));
        console.log('this.x>' + this.x);
        console.log('this.y>' + this.y);
        console.log('this.z>' + this.z);
        
      },
    },
    toGravity: {
      value: function(raw) {
        var state = priv.get(this);
        return raw / state.sensitivity;
      }
    }
  }
};

// Otherwise known as...
Controllers["MPU-6050"] = Controllers.MPU6050;
Controllers["TINKERKIT"] = Controllers.ANALOG;

function ToPrecision(val, precision) {
  return +(val).toPrecision(precision);
}

function magnitude(x, y, z) {
  var a;

  a = x * x;
  a = fma(y, y, a);
  a = fma(z, z, a);

  return Math.sqrt(a);
}

/**
 * Accelerometer
 * @constructor
 *
 * five.Accelerometer([ x, y[, z] ]);
 *
 * five.Accelerometer({
 *   pins: [ x, y[, z] ]
 *   zeroV: ...
 *   sensitivity: ...
 * });
 *
 *
 * @param {Object} opts [description]
 *
 */

function Accelerometer(opts) {
  if (!(this instanceof Accelerometer)) {
    return new Accelerometer(opts);
  }

  var controller = null;

  var state = {
    enabled: true,
    x: {
      value: 0,
      previous: 0,
      stash: [],
      orientation: null,
      inclination: null,
      acceleration: null,
      calibration: []
    },
    y: {
      value: 0,
      previous: 0,
      stash: [],
      orientation: null,
      inclination: null,
      acceleration: null,
      calibration: []
    },
    z: {
      value: 0,
      previous: 0,
      stash: [],
      orientation: null,
      inclination: null,
      acceleration: null,
      calibration: []
    }
  };

  Board.Component.call(
    this, opts = Board.Options(opts)
  );

  if (opts.controller && typeof opts.controller === "string") {
    controller = Controllers[opts.controller.toUpperCase()];
  } else {
    controller = opts.controller;
  }

  if (controller == null) {
    controller = Controllers["ANALOG"];
  }

  Object.defineProperties(this, controller);

  if (!this.toGravity) {
    this.toGravity = opts.toGravity || function(raw) { return raw; };
  }

  if (!this.enabledChanged) {
    this.enabledChanged = function() {};
  }

  priv.set(this, state);

  if (typeof this.initialize === "function") {
    this.initialize(opts, function(data) {
      var isChange = false;

      if (!state.enabled) {
        return;
      }

      Object.keys(data).forEach(function(axis) {
        console.log('here');
        var value = data[axis];
        var sensor = state[axis];

        if (opts.autoCalibrate && sensor.calibration.length < calibrationSize) {
          var axisIndex = axes.indexOf(axis);
          sensor.calibration.push(value);

          if (!Array.isArray(state.zeroV)) {
            state.zeroV = [];
          }

          state.zeroV[axisIndex] = __.sum(sensor.calibration) / sensor.calibration.length;
          if (axis === "z") {
            state.zeroV[axisIndex] -= state.sensitivity;
          }
        }

        // The first run needs to prime the "stash"
        // of data values.
        if (sensor.stash.length === 0) {
          for (var i = 0; i < 5; i++) {
            sensor.stash[i] = value;
          }
        }

        sensor.previous = sensor.value;
        sensor.stash.shift();
        sensor.stash.push(value);

        sensor.value = (sum(sensor.stash) / 5) | 0;

        if (this.acceleration !== sensor.acceleration) {
          sensor.acceleration = this.acceleration;
          isChange = true;
          this.emit("acceleration", sensor.acceleration);
        }

        if (this.orientation !== sensor.orientation) {
          sensor.orientation = this.orientation;
          isChange = true;
          this.emit("orientation", sensor.orientation);
        }

        if (this.inclination !== sensor.inclination) {
          sensor.inclination = this.inclination;
          isChange = true;
          this.emit("inclination", sensor.inclination);
        }
      }, this);

      this.emit("data", {
        x: state.x.value,
        y: state.y.value,
        z: state.z.value
      });

      if (isChange) {
        this.emit("change", {
          x: this.x,
          y: this.y,
          z: this.z
        });
      }
    }.bind(this));
  }

  Object.defineProperties(this, {
    hasAxis: {
      value: function(axis) {
        return state[axis] ? state[axis].stash.length > 0 : false;
      }
    },
    enable: {
      value: function() {
        state.enabled = true;
        this.enabledChanged(true);
        return this;
      }
    },
    disable: {
      value: function() {
        state.enabled = false;
        this.enabledChanged(false);
        return this;
      }
    },
    zeroV: {
      get: function() {
        return state.zeroV;
      }
    },
    /**
     * [read-only] Calculated pitch value
     * @property pitch
     * @type Number
     */
    pitch: {
      get: function() {
        var x, y, z, rads;

        x = this.x;
        y = this.y;
        z = this.z;


        rads = this.hasAxis("z") ?
          Math.atan2(x, Math.hypot(y, z)) :
          Math.asin(constrain(x, -1, 1));

        return ToPrecision(rads * rad2deg, 2);
      }
    },
    /**
     * [read-only] Calculated roll value
     * @property roll
     * @type Number
     */
    roll: {
      get: function() {
        var x, y, z, rads;

        x = this.x;
        y = this.y;
        z = this.z;

        rads = this.hasAxis("z") ?
          Math.atan2(y, Math.hypot(x, z)) :
          Math.asin(constrain(y, -1, 1));

        return ToPrecision(rads * rad2deg, 2);
      }
    },
    x: {
      get: function() {
        return ToPrecision(this.toGravity(state.x.value, "x"), 2);
      }
    },
    y: {
      get: function() {
        return ToPrecision(this.toGravity(state.y.value, "y"), 2);
      }
    },
    z: {
      get: function() {
        return this.hasAxis("z") ?
          ToPrecision(this.toGravity(state.z.value, "z"), 2) : 0;
      }
    },
    acceleration: {
      get: function() {
        return magnitude(
          this.x,
          this.y,
          this.z
        );
      }
    },
    inclination: {
      get: function() {
        return Math.atan2(this.y, this.x) * rad2deg;
      }
    },
    orientation: {
      get: function() {
        var abs = Math.abs;
        var x = this.x;
        var y = this.y;
        var z = this.hasAxis(z) ? this.z : 1;
        var xAbs = abs(x);
        var yAbs = abs(y);
        var zAbs = abs(z);

        if (xAbs < yAbs && xAbs < zAbs) {
          if (x > 0) {
            return 1;
          }
          return -1;
        }
        if (yAbs < xAbs && yAbs < zAbs) {
          if (y > 0) {
            return 2;
          }
          return -2;
        }
        if (zAbs < xAbs && zAbs < yAbs) {
          if (z > 0) {
            return 3;
          }
          return -3;
        }
        return 0;
      }
    }
  });
}


util.inherits(Accelerometer, events.EventEmitter);

module.exports = Accelerometer;
