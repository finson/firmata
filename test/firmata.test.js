global.IS_TEST_MODE = true;

var firmata = process.env.FIRMATA_COV ?
  require("../lib-cov/firmata") :
  require("../lib/firmata");
var com = require("../test/MockSerialPort");
var Encoder7Bit = require("../lib/encoder7bit");
var should = require("should");
var sinon = require("sinon");

var Board = firmata.Board;
var SerialPort = com.SerialPort;


var ANALOG_MAPPING_QUERY = 0x69;
var ANALOG_MAPPING_RESPONSE = 0x6A;
var ANALOG_MESSAGE = 0xE0;
var CAPABILITY_QUERY = 0x6B;
var CAPABILITY_RESPONSE = 0x6C;
var DIGITAL_MESSAGE = 0x90;
var END_SYSEX = 0xF7;
var EXTENDED_ANALOG = 0x6F;
var I2C_CONFIG = 0x78;
var I2C_REPLY = 0x77;
var I2C_REQUEST = 0x76;
var I2C_READ_MASK = 0x18;   // 0b00011000
var I2C_END_TX_MASK = 0x40; // 0b01000000
var ONEWIRE_CONFIG_REQUEST = 0x41;
var ONEWIRE_DATA = 0x73;
var ONEWIRE_DELAY_REQUEST_BIT = 0x10;
var ONEWIRE_READ_REPLY = 0x43;
var ONEWIRE_READ_REQUEST_BIT = 0x08;
var ONEWIRE_RESET_REQUEST_BIT = 0x01;
var ONEWIRE_SEARCH_ALARMS_REPLY = 0x45;
var ONEWIRE_SEARCH_ALARMS_REQUEST = 0x44;
var ONEWIRE_SEARCH_REPLY = 0x42;
var ONEWIRE_SEARCH_REQUEST = 0x40;
var ONEWIRE_WITHDATA_REQUEST_BITS = 0x3C;
var ONEWIRE_WRITE_REQUEST_BIT = 0x20;
var PIN_MODE = 0xF4;
var PIN_STATE_QUERY = 0x6D;
var PIN_STATE_RESPONSE = 0x6E;
var PING_READ = 0x75;
var PULSE_IN = 0x74;
var PULSE_OUT = 0x73;
var QUERY_FIRMWARE = 0x79;
var REPORT_ANALOG = 0xC0;
var REPORT_DIGITAL = 0xD0;
var REPORT_VERSION = 0xF9;
var SAMPLING_INTERVAL = 0x7A;
var SERVO_CONFIG = 0x70;
var SERIAL_MESSAGE = 0x60;
var SERIAL_CONFIG = 0x10;
var SERIAL_WRITE = 0x20;
var SERIAL_READ = 0x30;
var SERIAL_REPLY = 0x40;
var SERIAL_CLOSE = 0x50;
var SERIAL_FLUSH = 0x60;
var SERIAL_LISTEN = 0x70;
var START_SYSEX = 0xF0;
var STEPPER = 0x72;
var STRING_DATA = 0x71;
var SYSTEM_RESET = 0xFF;

// Used by custom sysex tests
var NON_STANDARD_REPLY = 0x11;

var sandbox = sinon.sandbox.create();

describe("Board.requestPort", function() {

  var response = {
    error: null,
    port: {
      comName: null
    },
  };

  beforeEach(function() {
    sandbox.stub(com, "list", function(callback) {
      process.nextTick(function() {
        callback(response.error, [response.port]);
      });
    });
  });

  afterEach(function() {
    sandbox.restore();
    response.error = null;
    response.port.comName = null;
  });

  it("can identify an acceptable port", function(done) {
    response.port.comName = "/dev/usb.whatever";
    should.equal(Board.isAcceptablePort(response.port), true);

    response.port.comName = "/dev/ttyACM0";
    should.equal(Board.isAcceptablePort(response.port), true);

    response.port.comName = "COM0";
    should.equal(Board.isAcceptablePort(response.port), true);

    done();
  });

  it("can identify an unacceptable port", function(done) {
    response.port.comName = "/dev/tty.Bluetooth-Incoming-Port";
    should.equal(Board.isAcceptablePort(response.port), false);

    response.port.comName = "/dev/someotherthing";
    should.equal(Board.isAcceptablePort(response.port), false);

    done();
  });

  it("calls callback with an acceptable port: usb", function(done) {
    response.port.comName = "/dev/usb.whatever";

    Board.requestPort(function(error, port) {
      should.equal(port, response.port);
      done();
    });
  });

  it("calls callback with an acceptable port: acm", function(done) {
    response.port.comName = "/dev/ttyACM0";

    Board.requestPort(function(error, port) {
      should.equal(port, response.port);
      done();
    });
  });

  it("calls callback with an acceptable port: com", function(done) {
    response.port.comName = "COM0";

    Board.requestPort(function(error, port) {
      should.equal(port, response.port);
      done();
    });
  });

  it("doesn't call callback with an unacceptable port: Bluetooth-Incoming-Port", function(done) {
    response.port.comName = "/dev/tty.Bluetooth-Incoming-Port";

    Board.requestPort(function(error, port) {
      should.equal(port, null);
      should.equal(error.message, "No Acceptable Port Found");
      done();
    });
  });

});


describe("board", function() {

  var spy;
  var serialPort = new SerialPort("/path/to/fake/usb");
  var boardStarted = false;
  var board = new Board(serialPort, function(err) {
    boardStarted = true;
    (typeof err).should.equal("undefined");
  });

  beforeEach(function() {
    Board.test.i2cActive.clear();

    spy = sandbox.spy(com, "SerialPort");

    board._events.length = 0;
  });

  afterEach(function() {
    Board.SYSEX_RESPONSE[NON_STANDARD_REPLY] = undefined;
    sandbox.restore();
  });

  it("uses serialport defaults", function(done) {
    var a = new Board("/path/to/fake/usb1", function(err) {});
    var b = new Board("/path/to/fake/usb2", function(err) {});

    should.equal(spy.getCall(0).args[0], "/path/to/fake/usb1");
    should.deepEqual(spy.getCall(0).args[1], { baudRate: 57600, bufferSize: 1 });

    should.equal(spy.getCall(1).args[0], "/path/to/fake/usb2");
    should.deepEqual(spy.getCall(1).args[1], { baudRate: 57600, bufferSize: 1 });

    done();
  });


  it("has a name", function(done) {
    var serialPort = new SerialPort("/path/to/fake/usb");
    var board = new Board(serialPort, function(err) {});

    board.name.should.equal("Firmata");
    done();
  });

  it("emits 'connect' when the transport is opened.", function(done) {
    var serialPort = new SerialPort("/path/to/fake/usb");
    var board = new Board(serialPort, function(err) {});

    board.on("connect", function() {
      done();
    });

    serialPort.emit("open");
  });

  it("emits 'ready' after handshakes complete (skipCapabilities)", function(done) {
    var serialPort = new SerialPort("/path/to/fake/usb");
    var board = new Board(serialPort, {skipCapabilities: true}, function(err) {});
    var connected = false;

    board.on("connect", function() {
      connected = true;
    });

    board.on("ready", function() {
      should.equal(connected, true);
      should.equal(this.isReady, true);
      done();
    });

    serialPort.emit("open");
    board.emit("reportversion");
    board.emit("queryfirmware");
  });

  it("emits 'ready' after handshakes complete", function(done) {
    var serialPort = new SerialPort("/path/to/fake/usb");
    var board = new Board(serialPort, function(err) {});
    var connected = false;

    board.on("connect", function() {
      connected = true;
    });

    board.on("ready", function() {
      should.equal(connected, true);
      should.equal(this.isReady, true);
      done();
    });

    serialPort.emit("open");
    board.emit("reportversion");
    board.emit("queryfirmware");
    board.emit("capability-query");
    board.emit("analog-mapping-query");
  });

  it("reports errors", function(done) {
    var serialPort = new SerialPort("/path/to/fake/usb");
    var board = new Board(serialPort, function(err) {
      "test error".should.equal(err);
      done();
    });

    serialPort.emit("error", "test error");
  });

  it("forwards close events", function(done) {
    var serialPort = new SerialPort("/path/to/fake/usb");
    var board = new Board(serialPort, function(err) {});

    board.on("close", done);

    serialPort.emit("close");
  });

  it("forwards disconnect events", function(done) {
    var serialPort = new SerialPort("/path/to/fake/usb");
    var board = new Board(serialPort, function(err) {});

    board.on("disconnect", done);

    serialPort.emit("disconnect");
  });

  it("forwards error events", function(done) {
    var serialPort = new SerialPort("/path/to/fake/usb");
    var board = new Board(serialPort, function(err) {});

    board.on("error", done);

    board.isReady = true;
    serialPort.emit("error");
  });

  it("sends report version and query firmware if it hasnt received the version within the timeout", function(done) {
    this.timeout(50000);
    var serialPort = new SerialPort("/path/to/fake/usb");
    var opt = {
      reportVersionTimeout: 1
    };
    var board = new Board(serialPort, opt, function(err) {});

    // rcheck for report version
    serialPort.once("write", function(data) {
      should.deepEqual(data, [REPORT_VERSION]);
      // check for query firmware
      serialPort.once("write", function(data) {
        should.deepEqual(data, [240, 121, 247]);
        done();
      });
    });
  });

  it("uses default baud rate and buffer size", function (done) {
    var port = "fake port";
    var board = new Board(port, function (err) {});

    should.deepEqual(
      spy.args, [ [ "fake port", { baudRate: 57600, bufferSize: 1 } ] ]
    );

    done();
  });

  it("overrides baud rate and buffer size", function (done) {
    var port = "fake port";
    var opt = {
      reportVersionTimeout: 1,
      serialport: {
        baudRate: 5,
        bufferSize: 10
      }
    };
    var board = new Board(port, opt, function (err) {});

    should.deepEqual(
      spy.args, [ [ "fake port", { baudRate: 5, bufferSize: 10 } ] ]
    );

    done();
  });

  it("receives the version on startup", function(done) {
    //"send" report version command back from arduino
    serialPort.emit("data", [REPORT_VERSION]);
    serialPort.emit("data", [0x02]);

    //subscribe to the "data" event to capture the event
    serialPort.once("data", function(buffer) {
      board.version.major.should.equal(2);
      board.version.minor.should.equal(3);
      done();
    });

    //send the last byte of command to get "data" event to fire when the report version function is called
    serialPort.emit("data", [0x03]);
  });

  it("receives the firmware after the version", function(done) {
    board.once("queryfirmware", function() {
      board.firmware.version.major.should.equal(2);
      board.firmware.version.minor.should.equal(3);
      board.firmware.name.should.equal("StandardFirmata");
      done();
    });
    serialPort.emit("data", [240]);
    serialPort.emit("data", [121]);
    serialPort.emit("data", [2]);
    serialPort.emit("data", [3]);
    serialPort.emit("data", [83]);
    serialPort.emit("data", [0]);
    serialPort.emit("data", [116]);
    serialPort.emit("data", [0]);
    serialPort.emit("data", [97]);
    serialPort.emit("data", [0]);
    serialPort.emit("data", [110]);
    serialPort.emit("data", [0]);
    serialPort.emit("data", [100]);
    serialPort.emit("data", [0]);
    serialPort.emit("data", [97]);
    serialPort.emit("data", [0]);
    serialPort.emit("data", [114]);
    serialPort.emit("data", [0]);
    serialPort.emit("data", [100]);
    serialPort.emit("data", [0]);
    serialPort.emit("data", [70]);
    serialPort.emit("data", [0]);
    serialPort.emit("data", [105]);
    serialPort.emit("data", [0]);
    serialPort.emit("data", [114]);
    serialPort.emit("data", [0]);
    serialPort.emit("data", [109]);
    serialPort.emit("data", [0]);
    serialPort.emit("data", [97]);
    serialPort.emit("data", [0]);
    serialPort.emit("data", [116]);
    serialPort.emit("data", [0]);
    serialPort.emit("data", [97]);
    serialPort.emit("data", [0]);
    serialPort.emit("data", [247]);
  });

  it("Optionally call setSamplingInterval after queryfirmware", function(done) {
    var spy = sandbox.spy(Board.prototype, "setSamplingInterval");
    var serialPort = new SerialPort("/path/to/fake/usb");
    var options = {
      skipCapabilities: true,
      samplingInterval: 100
    };

    var board = new Board(serialPort, options, function(err) {
      should.deepEqual(serialPort.lastWrite, [ 240, 122, 100, 0, 247 ]);
      should.equal(spy.callCount, 1);
      should.ok(spy.calledWith(100));

      spy.restore();
      done();
    });

    // Trigger fake "reportversion"
    serialPort.emit("data", [REPORT_VERSION, 0x02, 0x03]);

    // Trigger fake "queryfirmware"
    serialPort.emit("data", [
      240, 121, 2, 3, 83, 0, 116, 0, 97, 0, 110, 0, 100, 0,
      97, 0, 114, 0, 100, 0, 70, 0, 105, 0, 114, 0, 109, 0,
      97, 0, 116, 0, 97, 0, 247
    ]);
  });

  it("Does not call setSamplingInterval after queryfirmware by default", function(done) {
    var spy = sandbox.spy(Board.prototype, "setSamplingInterval");
    var serialPort = new SerialPort("/path/to/fake/usb");
    var options = {
      skipCapabilities: true,
    };

    var board = new Board(serialPort, options, function() {
      should.equal(spy.callCount, 0);
      spy.restore();
      done();
    });

    // Trigger fake "reportversion"
    serialPort.emit("data", [REPORT_VERSION, 0x02, 0x03]);

    // Trigger fake "queryfirmware"
    serialPort.emit("data", [
      240, 121, 2, 3, 83, 0, 116, 0, 97, 0, 110, 0, 100, 0,
      97, 0, 114, 0, 100, 0, 70, 0, 105, 0, 114, 0, 109, 0,
      97, 0, 116, 0, 97, 0, 247
    ]);
  });

  it("gets the capabilities after the firmware", function(done) {
    //[START_SYSEX, CAPABILITY_QUERY, END_SYSEX]
    should.deepEqual(serialPort.lastWrite, [START_SYSEX, CAPABILITY_QUERY, END_SYSEX]);

    //report back mock capabilities
    //taken from boards.h for arduino uno
    serialPort.emit("data", [START_SYSEX]);
    serialPort.emit("data", [CAPABILITY_RESPONSE]);

    for (var i = 0; i < 20; i++) {
      // if "pin" is digital it can be input and output
      if (i >= 2 && i <= 19) {
        //input is on
        serialPort.emit("data", [0]);
        serialPort.emit("data", [1]);
        //output is on
        serialPort.emit("data", [1]);
        serialPort.emit("data", [1]);
      }
      //if pin is analog
      if (i >= 14 && i <= 19) {
        serialPort.emit("data", [0x02]);
        serialPort.emit("data", [10]);
      }
      //if pin is PWM
      if ([3, 5, 6, 10, 11].indexOf(i) > -1) {
        serialPort.emit("data", [0x03]);
        serialPort.emit("data", [8]);
      }
      //all pins are servo
      if (i >= 2) {
        serialPort.emit("data", [0x04]);
        serialPort.emit("data", [14]);
      }
      //signal end of command for pin
      serialPort.emit("data", [127]);
    }

    //capture the event once to make all pin modes are set correctly
    serialPort.once("data", function() {
      board.pins.length.should.equal(20);
      board.pins.forEach(function(value, index) {
        if (index >= 2 && index <= 19) {
          value.supportedModes.indexOf(0).should.not.equal(-1);
          value.supportedModes.indexOf(1).should.not.equal(-1);
        } else {
          value.supportedModes.length.should.equal(0);
        }
        if (index >= 14 && index <= 19) {
          value.supportedModes.indexOf(0x02).should.not.equal(-1);
        } else {
          value.supportedModes.indexOf(0x02).should.equal(-1);
        }
        if ([3, 5, 6, 10, 11].indexOf(index) > -1) {
          value.supportedModes.indexOf(0x03).should.not.equal(-1);
        } else {
          value.supportedModes.indexOf(0x03).should.equal(-1);
        }
        if (index >= 2) {
          value.supportedModes.indexOf(0x04).should.not.equal(-1);
        }
      });
      done();
    });
    //end the sysex message
    serialPort.emit("data", [END_SYSEX]);
  });

  it("capabilities response is an idempotent operation", function(done) {

    var count = 0;
    var i = 0;

    serialPort.on("data", function data() {
      count++;

      // Should be 20 after both responses.
      board.pins.length.should.equal(20);

      if (count === 2) {
        serialPort.removeListener("data", data);
        done();
      }
    });

    // Fake two capabilities responses...
    // 1
    serialPort.emit("data", [START_SYSEX, CAPABILITY_RESPONSE]);
    for (i = 0; i < 20; i++) {
      serialPort.emit("data", [0, 1, 1, 1, 127]);
    }
    serialPort.emit("data", [END_SYSEX]);
    // 2
    serialPort.emit("data", [START_SYSEX, CAPABILITY_RESPONSE]);
    for (i = 0; i < 20; i++) {
      serialPort.emit("data", [0, 1, 1, 1, 127]);
    }
    serialPort.emit("data", [END_SYSEX]);
  });


  it("querys analog mappings after capabilities", function(done) {
    //[START_SYSEX, ANALOG_MAPPING_QUERY, END_SYSEX]
    should.deepEqual(serialPort.lastWrite, [START_SYSEX, ANALOG_MAPPING_QUERY, END_SYSEX]);

    serialPort.emit("data", [START_SYSEX]);
    serialPort.emit("data", [ANALOG_MAPPING_RESPONSE]);
    for (var i = 0; i < 20; i++) {
      if (i >= 14 && i < 20) {
        serialPort.emit("data", [i - 14]);
      } else {
        serialPort.emit("data", [127]);
      }
    }

    serialPort.once("data", function() {
      board.pins[14].analogChannel.should.equal(0);
      board.pins[15].analogChannel.should.equal(1);
      board.pins[16].analogChannel.should.equal(2);
      board.pins[17].analogChannel.should.equal(3);
      board.pins[18].analogChannel.should.equal(4);
      board.pins[19].analogChannel.should.equal(5);
      board.analogPins.length.should.equal(6);
      board.analogPins[0].should.equal(14);
      board.analogPins[1].should.equal(15);
      board.analogPins[2].should.equal(16);
      board.analogPins[3].should.equal(17);
      board.analogPins[4].should.equal(18);
      board.analogPins[5].should.equal(19);
      done();
    });
    serialPort.emit("data", [END_SYSEX]);
  });

  it("should now be started", function() {
    boardStarted.should.equal(true);
  });

  it("allows setting a valid sampling interval", function(done) {
    var spy = sandbox.spy(board.transport, "write");

    // Valid sampling interval
    board.setSamplingInterval(20);
    should.ok((new Buffer([0xf0, 0x7a, 0x14, 0x00, 0xf7])).equals(spy.lastCall.args[0]));

    // Invalid sampling interval is constrained to a valid interval
    // > 65535 => 65535
    board.setSamplingInterval(65540);
    should.ok((new Buffer([0xf0, 0x7a, 0x7f, 0x7f, 0xf7])).equals(spy.lastCall.args[0]));

    // Invalid sampling interval is constrained to a valid interval
    // < 10 => 10
    board.setSamplingInterval(0);
    should.ok((new Buffer([0xf0, 0x7a, 0x0a, 0x00, 0xf7])).equals(spy.lastCall.args[0]));

    spy.restore();
    done();
  });

  it("should be able to set pin mode on digital pin", function(done) {
    board.pinMode(2, board.MODES.INPUT);
    serialPort.lastWrite[0].should.equal(PIN_MODE);
    serialPort.lastWrite[1].should.equal(2);
    serialPort.lastWrite[2].should.equal(board.MODES.INPUT);
    board.pins[2].mode.should.equal(board.MODES.INPUT);
    done();
  });

  it("should be able to read value of digital pin", function(done) {
    var counter = 0;
    var order = [1, 0, 1, 0];
    board.digitalRead(2, function(value) {
      if (value === 1) {
        counter++;
      }
      if (value === 0) {
        counter++;
      }
      if (order[0] === value) {
        order.shift();
      }
      if (counter === 4) {
        order.length.should.equal(0);
        done();
      }
    });

    // Digital reporting turned on...
    should.deepEqual(serialPort.lastWrite, [ 208, 1 ]);

    // Single Byte
    serialPort.emit("data", [DIGITAL_MESSAGE]);
    serialPort.emit("data", [4 % 128]);
    serialPort.emit("data", [4 >> 7]);

    serialPort.emit("data", [DIGITAL_MESSAGE]);
    serialPort.emit("data", [0x00]);
    serialPort.emit("data", [0x00]);

    // Multi Byte
    serialPort.emit("data", [DIGITAL_MESSAGE, 4 % 128, 4 >> 7]);
    serialPort.emit("data", [DIGITAL_MESSAGE, 0x00, 0x00]);
  });

  it("should be able to set mode on analog pins", function(done) {
    board.pinMode(board.analogPins[0], board.MODES.INPUT);
    serialPort.lastWrite[0].should.equal(PIN_MODE);
    serialPort.lastWrite[1].should.equal(board.analogPins[0]);
    serialPort.lastWrite[2].should.equal(board.MODES.INPUT);
    done();
  });

  it("should be able to read value of analog pin", function(done) {
    var counter = 0;
    var order = [1023, 0, 1023, 0];
    board.analogRead(1, function(value) {
      if (value === 1023) {
        counter++;
      }
      if (value === 0) {
        counter++;
      }
      if (order[0] === value) {
        order.shift();
      }
      if (counter === 4) {
        order.length.should.equal(0);
        done();
      }
    });

    // Analog reporting turned on...
    should.deepEqual(serialPort.lastWrite, [ 193, 1 ]);

    // Single Byte
    serialPort.emit("data", [ANALOG_MESSAGE | (1 & 0xF)]);
    serialPort.emit("data", [1023 % 128]);
    serialPort.emit("data", [1023 >> 7]);

    serialPort.emit("data", [ANALOG_MESSAGE | (1 & 0xF)]);
    serialPort.emit("data", [0 % 128]);
    serialPort.emit("data", [0 >> 7]);

    // Multi Byte
    serialPort.emit("data", [ANALOG_MESSAGE | (1 & 0xF), 1023 % 128, 1023 >> 7]);
    serialPort.emit("data", [ANALOG_MESSAGE | (1 & 0xF), 0 % 128, 0 >> 7]);
  });

  it("should be able to read value of analog pin on a board that skipped capabilities check", function(done) {
    var serialPort = new SerialPort("/path/to/fake/usb");
    var board = new Board(serialPort, {skipCapabilities: true, analogPins: [14,15,16,17,18,19]}, function(err) {});

    board.on("ready", function() {
      var counter = 0;
      var order = [1023, 0, 1023, 0];
      board.analogRead(1, function(value) {
        if (value === 1023) {
          counter++;
        }
        if (value === 0) {
          counter++;
        }
        if (order[0] === value) {
          order.shift();
        }
        if (counter === 4) {
          order.length.should.equal(0);
          done();
        }
      });

      // Analog reporting turned on...
      should.deepEqual(serialPort.lastWrite, [ 193, 1 ]);

      // Single Byte
      serialPort.emit("data", [ANALOG_MESSAGE | (1 & 0xF)]);
      serialPort.emit("data", [1023 % 128]);
      serialPort.emit("data", [1023 >> 7]);

      serialPort.emit("data", [ANALOG_MESSAGE | (1 & 0xF)]);
      serialPort.emit("data", [0 % 128]);
      serialPort.emit("data", [0 >> 7]);

      // Multi Byte
      serialPort.emit("data", [ANALOG_MESSAGE | (1 & 0xF), 1023 % 128, 1023 >> 7]);
      serialPort.emit("data", [ANALOG_MESSAGE | (1 & 0xF), 0 % 128, 0 >> 7]);
    });

    serialPort.emit("open");
    board.emit("reportversion");
    board.emit("queryfirmware");
  });

  it("should be able to write a value to a digital output", function(done) {
    board.digitalWrite(3, board.HIGH);
    should.deepEqual(serialPort.lastWrite, [DIGITAL_MESSAGE, 8, 0]);

    board.digitalWrite(3, board.LOW);
    should.deepEqual(serialPort.lastWrite, [DIGITAL_MESSAGE, 0, 0]);

    done();
  });

  it("should be able to write a value to a digital output to a board that skipped capabilities check", function(done) {
    var serialPort = new SerialPort("/path/to/fake/usb");
    var board = new Board(serialPort, {skipCapabilities: true}, function(err) {});

    board.on("ready", function() {
      board.digitalWrite(3, board.HIGH);
      should.deepEqual(serialPort.lastWrite, [DIGITAL_MESSAGE, 8, 0]);

      board.digitalWrite(3, board.LOW);
      should.deepEqual(serialPort.lastWrite, [DIGITAL_MESSAGE, 0, 0]);
      done();
    });

    serialPort.emit("open");
    board.emit("reportversion");
    board.emit("queryfirmware");

  });

  it("should be able to write a value to an analog pin being used as a digital output", function(done) {
    board.digitalWrite(19, board.HIGH);
    // `DIGITAL_MESSAGE | 2` => Digital Message on Port 2
    should.deepEqual(serialPort.lastWrite, [DIGITAL_MESSAGE | 2, 8, 0]);

    board.digitalWrite(19, board.LOW);
    should.deepEqual(serialPort.lastWrite, [DIGITAL_MESSAGE | 2, 0, 0]);

    done();
  });

  it("should be able to write a value to a analog output", function(done) {
    board.analogWrite(board.analogPins[1], 1023);
    should.deepEqual(serialPort.lastWrite, [ANALOG_MESSAGE | board.analogPins[1], 127, 7]);

    board.analogWrite(board.analogPins[1], 0);
    should.deepEqual(serialPort.lastWrite, [ANALOG_MESSAGE | board.analogPins[1], 0, 0]);
    done();
  });

  it("should be able to write a value to an extended analog output", function(done) {
    var length = board.pins.length;

    board.pins[46] = {
      supportedModes: [0, 1, 4],
      mode: 4,
      value: 0,
      report: 1,
      analogChannel: 127
    };

    board.analogWrite(46, 180);
    should.deepEqual(serialPort.lastWrite, [START_SYSEX, EXTENDED_ANALOG, 46, 52, 1, END_SYSEX]);

    board.analogWrite(46, 0);
    should.deepEqual(serialPort.lastWrite, [START_SYSEX, EXTENDED_ANALOG, 46, 0, 0, END_SYSEX]);

    // Restore to original length
    board.pins.length = length;

    done();
  });


  it("should be able to send a string", function(done) {
    var bytes = new Buffer("test string", "utf8");
    var length = bytes.length;
    board.sendString(bytes);
    serialPort.lastWrite[0].should.equal(START_SYSEX);
    serialPort.lastWrite[1].should.equal(STRING_DATA);
    for (var i = 0; i < length; i++) {
      serialPort.lastWrite[i * 2 + 2].should.equal(bytes[i] & 0x7F);
      serialPort.lastWrite[i * 2 + 3].should.equal((bytes[i + 1] >> 7) & 0x7F);
    }
    serialPort.lastWrite[length * 2 + 2].should.equal(0);
    serialPort.lastWrite[length * 2 + 3].should.equal(0);
    serialPort.lastWrite[length * 2 + 4].should.equal(END_SYSEX);
    done();
  });
  it("should emit a string event", function(done) {
    board.on("string", function(string) {
      string.should.equal("test string");
      done();
    });
    serialPort.emit("data", [START_SYSEX]);
    serialPort.emit("data", [STRING_DATA]);
    var bytes = new Buffer("test string", "utf8");
    Array.prototype.forEach.call(bytes, function(value, index) {
      serialPort.emit("data", [value]);
    });
    serialPort.emit("data", [END_SYSEX]);
  });

  it("can query pin state", function(done) {
    board.queryPinState(2, function() {
      board.pins[2].state.should.equal(1024);
      done();
    });
    should.deepEqual(serialPort.lastWrite, [START_SYSEX, PIN_STATE_QUERY, 2, END_SYSEX]);
    serialPort.emit("data", [START_SYSEX]);
    serialPort.emit("data", [PIN_STATE_RESPONSE]);
    serialPort.emit("data", [2]);
    serialPort.emit("data", [board.MODES.INPUT]);
    serialPort.emit("data", [1024]);
    serialPort.emit("data", [END_SYSEX]);
  });

  it("cannot pingRead without PingFirmata", function(done) {
    should.throws(function() {
      board.pingRead({
        pin: 3
      });
    });

    done();
  });

  it("can send a pingRead without a timeout and without a pulse out", function(done) {
    board.pins[3].supportedModes.push(PING_READ);
    board.pingRead({
      pin: 3,
      value: board.HIGH,
      timeout: 1000000
    }, function(duration) {
      duration.should.equal(0);
      done();
    });
    should.deepEqual(serialPort.lastWrite, [START_SYSEX, PING_READ, 3, board.HIGH, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 15, 0, 66, 0, 64, 0, END_SYSEX]);

    serialPort.emit("data", [START_SYSEX]);
    serialPort.emit("data", [PING_READ]);
    serialPort.emit("data", [3]);
    serialPort.emit("data", [0]);
    serialPort.emit("data", [0]);
    serialPort.emit("data", [0]);
    serialPort.emit("data", [0]);
    serialPort.emit("data", [0]);
    serialPort.emit("data", [0]);
    serialPort.emit("data", [0]);
    serialPort.emit("data", [0]);
    serialPort.emit("data", [0]);
    serialPort.emit("data", [END_SYSEX]);
  });

  it("can send a pingRead with a timeout and a pulse out", function(done) {
    board.pingRead({
      pin: 3,
      value: board.HIGH,
      pulseOut: 5,
      timeout: 1000000
    }, function(duration) {
      duration.should.equal(1000000);
      done();
    });
    should.deepEqual(serialPort.lastWrite, [START_SYSEX, PING_READ, 3, board.HIGH, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 15, 0, 66, 0, 64, 0, END_SYSEX]);

    serialPort.emit("data", [START_SYSEX]);
    serialPort.emit("data", [PING_READ]);
    serialPort.emit("data", [3]);
    serialPort.emit("data", [0]);
    serialPort.emit("data", [0]);
    serialPort.emit("data", [0]);
    serialPort.emit("data", [15]);
    serialPort.emit("data", [0]);
    serialPort.emit("data", [66]);
    serialPort.emit("data", [0]);
    serialPort.emit("data", [64]);
    serialPort.emit("data", [0]);
    serialPort.emit("data", [END_SYSEX]);
  });
  it("can send a pingRead with a pulse out and without a timeout ", function(done) {
    board.pingRead({
      pin: 3,
      value: board.HIGH,
      pulseOut: 5
    }, function(duration) {
      duration.should.equal(1000000);
      done();
    });
    serialPort.lastWrite[0].should.equal(START_SYSEX);
    serialPort.lastWrite[1].should.equal(PING_READ);
    serialPort.lastWrite[2].should.equal(3);
    serialPort.lastWrite[3].should.equal(board.HIGH);
    serialPort.lastWrite[4].should.equal(0);
    serialPort.lastWrite[5].should.equal(0);
    serialPort.lastWrite[6].should.equal(0);
    serialPort.lastWrite[7].should.equal(0);
    serialPort.lastWrite[8].should.equal(0);
    serialPort.lastWrite[9].should.equal(0);
    serialPort.lastWrite[10].should.equal(5);
    serialPort.lastWrite[11].should.equal(0);
    serialPort.lastWrite[12].should.equal(0);
    serialPort.lastWrite[13].should.equal(0);
    serialPort.lastWrite[14].should.equal(15);
    serialPort.lastWrite[15].should.equal(0);
    serialPort.lastWrite[16].should.equal(66);
    serialPort.lastWrite[17].should.equal(0);
    serialPort.lastWrite[18].should.equal(64);
    serialPort.lastWrite[19].should.equal(0);
    serialPort.lastWrite[20].should.equal(END_SYSEX);
    serialPort.emit("data", [START_SYSEX]);
    serialPort.emit("data", [PING_READ]);
    serialPort.emit("data", [3]);
    serialPort.emit("data", [0]);
    serialPort.emit("data", [0]);
    serialPort.emit("data", [0]);
    serialPort.emit("data", [15]);
    serialPort.emit("data", [0]);
    serialPort.emit("data", [66]);
    serialPort.emit("data", [0]);
    serialPort.emit("data", [64]);
    serialPort.emit("data", [0]);
    serialPort.emit("data", [END_SYSEX]);
  });

  it("can send a stepper config for a driver configuration", function(done) {
    board.stepperConfig(0, board.STEPPER.TYPE.DRIVER, 200, 2, 3);
    serialPort.lastWrite[0].should.equal(START_SYSEX);
    serialPort.lastWrite[1].should.equal(STEPPER);
    serialPort.lastWrite[2].should.equal(0);
    serialPort.lastWrite[3].should.equal(0);
    serialPort.lastWrite[4].should.equal(board.STEPPER.TYPE.DRIVER);
    serialPort.lastWrite[5].should.equal(200 & 0x7F);
    serialPort.lastWrite[6].should.equal((200 >> 7) & 0x7F);
    serialPort.lastWrite[7].should.equal(2);
    serialPort.lastWrite[8].should.equal(3);
    serialPort.lastWrite[9].should.equal(END_SYSEX);
    done();
  });

  it("can send a stepper config for a two wire configuration", function(done) {
    board.stepperConfig(0, board.STEPPER.TYPE.TWO_WIRE, 200, 2, 3);
    serialPort.lastWrite[0].should.equal(START_SYSEX);
    serialPort.lastWrite[1].should.equal(STEPPER);
    serialPort.lastWrite[2].should.equal(0);
    serialPort.lastWrite[3].should.equal(0);
    serialPort.lastWrite[4].should.equal(board.STEPPER.TYPE.TWO_WIRE);
    serialPort.lastWrite[5].should.equal(200 & 0x7F);
    serialPort.lastWrite[6].should.equal((200 >> 7) & 0x7F);
    serialPort.lastWrite[7].should.equal(2);
    serialPort.lastWrite[8].should.equal(3);
    serialPort.lastWrite[9].should.equal(END_SYSEX);
    done();
  });

  it("can send a stepper config for a four wire configuration", function(done) {
    board.stepperConfig(0, board.STEPPER.TYPE.FOUR_WIRE, 200, 2, 3, 4, 5);
    serialPort.lastWrite[0].should.equal(START_SYSEX);
    serialPort.lastWrite[1].should.equal(STEPPER);
    serialPort.lastWrite[2].should.equal(0);
    serialPort.lastWrite[3].should.equal(0);
    serialPort.lastWrite[4].should.equal(board.STEPPER.TYPE.FOUR_WIRE);
    serialPort.lastWrite[5].should.equal(200 & 0x7F);
    serialPort.lastWrite[6].should.equal((200 >> 7) & 0x7F);
    serialPort.lastWrite[7].should.equal(2);
    serialPort.lastWrite[8].should.equal(3);
    serialPort.lastWrite[9].should.equal(4);
    serialPort.lastWrite[10].should.equal(5);
    serialPort.lastWrite[11].should.equal(END_SYSEX);
    done();
  });

  it("can send a stepper move without acceleration or deceleration", function(done) {
    board.stepperStep(2, board.STEPPER.DIRECTION.CCW, 10000, 2000, function(complete) {
      complete.should.equal(true);
      done();
    });
    serialPort.lastWrite[0].should.equal(START_SYSEX);
    serialPort.lastWrite[1].should.equal(STEPPER);
    serialPort.lastWrite[2].should.equal(1);
    serialPort.lastWrite[3].should.equal(2);
    serialPort.lastWrite[4].should.equal(board.STEPPER.DIRECTION.CCW);
    serialPort.lastWrite[5].should.equal(10000 & 0x7F);
    serialPort.lastWrite[6].should.equal((10000 >> 7) & 0x7F);
    serialPort.lastWrite[7].should.equal((10000 >> 14) & 0x7F);
    serialPort.lastWrite[8].should.equal(2000 & 0x7F);
    serialPort.lastWrite[9].should.equal((2000 >> 7) & 0x7F);
    serialPort.lastWrite[9].should.equal((2000 >> 7) & 0x7F);
    serialPort.lastWrite[10].should.equal(END_SYSEX);
    serialPort.emit("data", [START_SYSEX]);
    serialPort.emit("data", [STEPPER]);
    serialPort.emit("data", [2]);
    serialPort.emit("data", [END_SYSEX]);
  });

  it("can send a stepper move with acceleration and deceleration", function(done) {
    board.stepperStep(3, board.STEPPER.DIRECTION.CCW, 10000, 2000, 3000, 8000, function(complete) {
      complete.should.equal(true);
      done();
    });

    var message = [START_SYSEX, STEPPER, 1, 3, board.STEPPER.DIRECTION.CCW, 10000 & 0x7F, (10000 >> 7) & 0x7F, (10000 >> 14) & 0x7F, 2000 & 0x7F, (2000 >> 7) & 0x7F, 3000 & 0x7F, (3000 >> 7) & 0x7F, 8000 & 0x7F, (8000 >> 7) & 0x7F, END_SYSEX];
    should.deepEqual(serialPort.lastWrite, message);

    serialPort.emit("data", [START_SYSEX]);
    serialPort.emit("data", [STEPPER]);
    serialPort.emit("data", [3]);
    serialPort.emit("data", [END_SYSEX]);
  });
  it("should be able to send a 1-wire config with parasitic power enabled", function(done) {
    board.sendOneWireConfig(1, true);
    serialPort.lastWrite[0].should.equal(START_SYSEX);
    serialPort.lastWrite[1].should.equal(PULSE_OUT);
    serialPort.lastWrite[2].should.equal(ONEWIRE_CONFIG_REQUEST);
    serialPort.lastWrite[3].should.equal(ONEWIRE_RESET_REQUEST_BIT);
    serialPort.lastWrite[4].should.equal(ONEWIRE_RESET_REQUEST_BIT);
    serialPort.lastWrite[5].should.equal(END_SYSEX);
    done();
  });
  it("should be able to send a 1-wire config with parasitic power disabled", function(done) {
    board.sendOneWireConfig(1, false);
    serialPort.lastWrite[0].should.equal(START_SYSEX);
    serialPort.lastWrite[1].should.equal(PULSE_OUT);
    serialPort.lastWrite[2].should.equal(ONEWIRE_CONFIG_REQUEST);
    serialPort.lastWrite[3].should.equal(ONEWIRE_RESET_REQUEST_BIT);
    serialPort.lastWrite[4].should.equal(0x00);
    serialPort.lastWrite[5].should.equal(END_SYSEX);
    done();
  });
  it("should be able to send a 1-wire search request and recieve a reply", function(done) {
    board.sendOneWireSearch(1, function(error, devices) {
      devices.length.should.equal(1);

      done();
    });
    serialPort.lastWrite[0].should.equal(START_SYSEX);
    serialPort.lastWrite[1].should.equal(PULSE_OUT);
    serialPort.lastWrite[2].should.equal(ONEWIRE_SEARCH_REQUEST);
    serialPort.lastWrite[3].should.equal(ONEWIRE_RESET_REQUEST_BIT);
    serialPort.lastWrite[4].should.equal(END_SYSEX);

    serialPort.emit("data", [START_SYSEX, PULSE_OUT, ONEWIRE_SEARCH_REPLY, ONEWIRE_RESET_REQUEST_BIT, 0x28, 0x36, 0x3F, 0x0F, 0x52, 0x00, 0x00, 0x00, 0x5D, 0x00, END_SYSEX]);
  });
  it("should be able to send a 1-wire search alarm request and recieve a reply", function(done) {
    board.sendOneWireAlarmsSearch(1, function(error, devices) {
      devices.length.should.equal(1);

      done();
    });
    serialPort.lastWrite[0].should.equal(START_SYSEX);
    serialPort.lastWrite[1].should.equal(PULSE_OUT);
    serialPort.lastWrite[2].should.equal(ONEWIRE_SEARCH_ALARMS_REQUEST);
    serialPort.lastWrite[3].should.equal(ONEWIRE_RESET_REQUEST_BIT);
    serialPort.lastWrite[4].should.equal(END_SYSEX);

    serialPort.emit("data", [START_SYSEX, PULSE_OUT, ONEWIRE_SEARCH_ALARMS_REPLY, ONEWIRE_RESET_REQUEST_BIT, 0x28, 0x36, 0x3F, 0x0F, 0x52, 0x00, 0x00, 0x00, 0x5D, 0x00, END_SYSEX]);
  });
  it("should be able to send a 1-wire reset request", function(done) {
    board.sendOneWireReset(1);

    serialPort.lastWrite[0].should.equal(START_SYSEX);
    serialPort.lastWrite[1].should.equal(PULSE_OUT);
    serialPort.lastWrite[2].should.equal(ONEWIRE_RESET_REQUEST_BIT);
    serialPort.lastWrite[3].should.equal(ONEWIRE_RESET_REQUEST_BIT);

    done();
  });
  it("should be able to send a 1-wire delay request", function(done) {
    var delay = 1000;

    board.sendOneWireDelay(1, delay);

    serialPort.lastWrite[0].should.equal(START_SYSEX);
    serialPort.lastWrite[1].should.equal(PULSE_OUT);
    serialPort.lastWrite[2].should.equal(ONEWIRE_WITHDATA_REQUEST_BITS);
    serialPort.lastWrite[3].should.equal(ONEWIRE_RESET_REQUEST_BIT);

    // decode delay from request
    var request = Encoder7Bit.from7BitArray(serialPort.lastWrite.slice(4, serialPort.lastWrite.length - 1));
    var sentDelay = request[12] | (request[13] << 8) | (request[14] << 12) | request[15] << 24;
    sentDelay.should.equal(delay);

    done();
  });
  it("should be able to send a 1-wire write request", function(done) {
    var device = [40, 219, 239, 33, 5, 0, 0, 93];
    var data = 0x33;

    board.sendOneWireWrite(1, device, data);

    serialPort.lastWrite[0].should.equal(START_SYSEX);
    serialPort.lastWrite[1].should.equal(PULSE_OUT);
    serialPort.lastWrite[2].should.equal(ONEWIRE_WITHDATA_REQUEST_BITS);
    serialPort.lastWrite[3].should.equal(ONEWIRE_RESET_REQUEST_BIT);

    // decode delay from request
    var request = Encoder7Bit.from7BitArray(serialPort.lastWrite.slice(4, serialPort.lastWrite.length - 1));

    // should select the passed device
    request[0].should.equal(device[0]);
    request[1].should.equal(device[1]);
    request[2].should.equal(device[2]);
    request[3].should.equal(device[3]);
    request[4].should.equal(device[4]);
    request[5].should.equal(device[5]);
    request[6].should.equal(device[6]);
    request[7].should.equal(device[7]);

    // and send the passed data
    request[16].should.equal(data);

    done();
  });
  it("should be able to send a 1-wire write and read request and recieve a reply", function(done) {
    var device = [40, 219, 239, 33, 5, 0, 0, 93];
    var data = 0x33;
    var output = [ONEWIRE_RESET_REQUEST_BIT, 0x02];

    board.sendOneWireWriteAndRead(1, device, data, 2, function(error, receieved) {
      receieved.should.eql(output);

      done();
    });

    serialPort.lastWrite[0].should.equal(START_SYSEX);
    serialPort.lastWrite[1].should.equal(PULSE_OUT);
    serialPort.lastWrite[2].should.equal(ONEWIRE_WITHDATA_REQUEST_BITS);
    serialPort.lastWrite[3].should.equal(ONEWIRE_RESET_REQUEST_BIT);

    // decode delay from request
    var request = Encoder7Bit.from7BitArray(serialPort.lastWrite.slice(4, serialPort.lastWrite.length - 1));

    // should select the passed device
    request[0].should.equal(device[0]);
    request[1].should.equal(device[1]);
    request[2].should.equal(device[2]);
    request[3].should.equal(device[3]);
    request[4].should.equal(device[4]);
    request[5].should.equal(device[5]);
    request[6].should.equal(device[6]);
    request[7].should.equal(device[7]);

    // and send the passed data
    request[16].should.equal(data);

    var dataSentFromBoard = [];

    // respond with the same correlation id
    dataSentFromBoard[0] = request[10];
    dataSentFromBoard[1] = request[11];

    // data "read" from the 1-wire device
    dataSentFromBoard[2] = output[0];
    dataSentFromBoard[3] = output[1];

    serialPort.emit("data", [START_SYSEX, PULSE_OUT, ONEWIRE_READ_REPLY, ONEWIRE_RESET_REQUEST_BIT].concat(Encoder7Bit.to7BitArray(dataSentFromBoard)).concat([END_SYSEX]));
  });

  describe("servo", function() {
    it("can configure a servo pwm range", function(done) {
      board.servoConfig(3, 1000, 2000);
      serialPort.lastWrite[0].should.equal(START_SYSEX);
      serialPort.lastWrite[1].should.equal(SERVO_CONFIG);
      serialPort.lastWrite[2].should.equal(0x03);

      serialPort.lastWrite[3].should.equal(1000 & 0x7F);
      serialPort.lastWrite[4].should.equal((1000 >> 7) & 0x7F);

      serialPort.lastWrite[5].should.equal(2000 & 0x7F);
      serialPort.lastWrite[6].should.equal((2000 >> 7) & 0x7F);

      done();
    });

    it("can configure a servo pwm range, with object", function(done) {
      board.servoConfig({
        pin: 3,
        min: 1000,
        max: 2000,
      });
      serialPort.lastWrite[0].should.equal(START_SYSEX);
      serialPort.lastWrite[1].should.equal(SERVO_CONFIG);
      serialPort.lastWrite[2].should.equal(0x03);

      serialPort.lastWrite[3].should.equal(1000 & 0x7F);
      serialPort.lastWrite[4].should.equal((1000 >> 7) & 0x7F);

      serialPort.lastWrite[5].should.equal(2000 & 0x7F);
      serialPort.lastWrite[6].should.equal((2000 >> 7) & 0x7F);

      done();
    });

    it("will throw if servoConfig is missing any parameters", function(done) {

      should.throws(function() {
        board.servoConfig();
      });

      should.throws(function() {
        board.servoConfig(3, 1000);
      });

      should.throws(function() {
        board.servoConfig({
          min: 1000,
          max: 2000,
        });
      });

      should.throws(function() {
        board.servoConfig({
          pin: 3,
          max: 2000,
        });
      });

      should.throws(function() {
        board.servoConfig({
          pin: 3,
          min: 1000,
        });
      });

      should.throws(function() {
        board.servoConfig({});
      });

      done();
    });
  });

  describe("I2C", function() {

    it("throws if i2c not enabled", function(done) {

      should.throws(function() {
        board.i2cRead(1, 1, function() {});
      });
      should.throws(function() {
        board.i2cReadOnce(1, 1, function() {});
      });
      should.throws(function() {
        board.i2cWrite(1, [1, 2, 3]);
      });
      should.throws(function() {
        board.i2cWriteReg(1, 1, 1);
      });

      done();
    });

    it("should be able to send an i2c config (empty)", function(done) {
      board.i2cConfig();
      should.deepEqual(serialPort.lastWrite, [START_SYSEX, I2C_CONFIG, 0, 0, END_SYSEX]);
      done();
    });

    it("should be able to send an i2c config (number)", function(done) {
      board.i2cConfig(1);
      should.deepEqual(serialPort.lastWrite, [START_SYSEX, I2C_CONFIG, 1 & 0xFF, (1 >> 8) & 0xFF, END_SYSEX]);
      done();
    });

    it("should be able to send an i2c config (object with delay property)", function(done) {
      board.i2cConfig({ delay: 1 });
      should.deepEqual(serialPort.lastWrite, [START_SYSEX, I2C_CONFIG, 1 & 0xFF, (1 >> 8) & 0xFF, END_SYSEX]);
      done();
    });

    it("should be able to send an i2c request", function(done) {
      board.i2cConfig(1);
      board.sendI2CWriteRequest(0x68, [1, 2, 3]);
      var request = [START_SYSEX, I2C_REQUEST, 0x68, 0 << 3, 1 & 0x7F, (1 >> 7) & 0x7F, 2 & 0x7F, (2 >> 7) & 0x7F, 3 & 0x7F, (3 >> 7) & 0x7F, END_SYSEX];
      should.deepEqual(serialPort.lastWrite, request);
      done();
    });

    it("should be able to receive an i2c reply", function(done) {
      var handler = sandbox.spy(function() {});
      board.i2cConfig(1);
      board.sendI2CReadRequest(0x68, 4, handler);
      should.deepEqual(serialPort.lastWrite, [START_SYSEX, I2C_REQUEST, 0x68, 1 << 3, 4 & 0x7F, (4 >> 7) & 0x7F, END_SYSEX]);

      // Start
      serialPort.emit("data", [START_SYSEX]);
      // Reply
      serialPort.emit("data", [I2C_REPLY]);
      // Address
      serialPort.emit("data", [0x68 % 128]);
      serialPort.emit("data", [0x68 >> 7]);
      // Register
      serialPort.emit("data", [0]);
      serialPort.emit("data", [0]);
      // Data 0
      serialPort.emit("data", [1 & 0x7F]);
      serialPort.emit("data", [(1 >> 7) & 0x7F]);
      // Data 1
      serialPort.emit("data", [2 & 0x7F]);
      serialPort.emit("data", [(2 >> 7) & 0x7F]);
      // Data 2
      serialPort.emit("data", [3 & 0x7F]);
      serialPort.emit("data", [(3 >> 7) & 0x7F]);
      // Data 3
      serialPort.emit("data", [4 & 0x7F]);
      serialPort.emit("data", [(4 >> 7) & 0x7F]);
      // End
      serialPort.emit("data", [END_SYSEX]);

      should.equal(handler.callCount, 1);
      should.deepEqual(handler.getCall(0).args[0], [1, 2, 3, 4]);

      done();
    });
    it("does not create default settings for an i2c peripheral, when call to i2cConfig does not include address", function(done) {
      board.i2cConfig();

      should.deepEqual(Board.test.i2cActive.get(board), { delay: 0 });

      done();
    });

    it("creates default settings for an i2c peripheral, with call to i2cConfig that includes address", function(done) {
      board.i2cConfig({
        address: 0x00
      });

      should.deepEqual(Board.test.i2cActive.get(board), {
        0: {
          stopTX: true,
        },
        delay: 0,
      });

      done();
    });

    it("creates default settings for an i2c peripheral, without call to i2cConfig for that peripheral (i2cWrite)", function(done) {
      // This has to be called no matter what,
      // but it might be the case that it's called once in a program,
      // where there are several different i2c peripherals.
      board.i2cConfig();

      board.i2cWrite(0x00, [0x01, 0x02]);
      board.i2cWrite(0x05, [0x06, 0x07]);

      should.deepEqual(Board.test.i2cActive.get(board), {
        0: {
          stopTX: true,
        },
        5: {
          stopTX: true,
        },
        delay: 0,
      });

      done();
    });

    it("creates default settings for an i2c peripheral, without call to i2cConfig for that peripheral (i2cWriteReg)", function(done) {
      // This has to be called no matter what,
      // but it might be the case that it's called once in a program,
      // where there are several different i2c peripherals.
      board.i2cConfig();

      board.i2cWriteReg(0x00, 0x01, 0x02);
      board.i2cWriteReg(0x05, 0x06, 0x07);

      should.deepEqual(Board.test.i2cActive.get(board), {
        0: {
          stopTX: true,
        },
        5: {
          stopTX: true,
        },
        delay: 0,
      });

      done();
    });

    it("creates default settings for an i2c peripheral, without call to i2cConfig for that peripheral (i2cRead w/ Register)", function(done) {
      // This has to be called no matter what,
      // but it might be the case that it's called once in a program,
      // where there are several different i2c peripherals.
      board.i2cConfig();

      board.i2cRead(0x00, 0x01, 1, function() {});
      board.i2cRead(0x05, 0x06, 1, function() {});

      should.deepEqual(Board.test.i2cActive.get(board), {
        0: {
          stopTX: true,
        },
        5: {
          stopTX: true,
        },
        delay: 0,
      });

      done();
    });

    it("creates default settings for an i2c peripheral, without call to i2cConfig for that peripheral (i2cRead w/o Register)", function(done) {
      // This has to be called no matter what,
      // but it might be the case that it's called once in a program,
      // where there are several different i2c peripherals.
      board.i2cConfig();

      board.i2cRead(0x00, 1, function() {});
      board.i2cRead(0x05, 1, function() {});

      should.deepEqual(Board.test.i2cActive.get(board), {
        0: {
          stopTX: true,
        },
        5: {
          stopTX: true,
        },
        delay: 0,
      });

      done();
    });

    it("creates default settings for an i2c peripheral, without call to i2cConfig for that peripheral (i2cReadOnce w/ Register)", function(done) {
      // This has to be called no matter what,
      // but it might be the case that it's called once in a program,
      // where there are several different i2c peripherals.
      board.i2cConfig();

      board.i2cReadOnce(0x00, 0x01, 1, function() {});
      board.i2cReadOnce(0x05, 0x06, 1, function() {});

      should.deepEqual(Board.test.i2cActive.get(board), {
        0: {
          stopTX: true,
        },
        5: {
          stopTX: true,
        },
        delay: 0,
      });

      done();
    });

    it("creates default settings for an i2c peripheral, without call to i2cConfig for that peripheral (i2cReadOnce w/o Register)", function(done) {
      // This has to be called no matter what,
      // but it might be the case that it's called once in a program,
      // where there are several different i2c peripherals.
      board.i2cConfig();

      board.i2cReadOnce(0x00, 1, function() {});
      board.i2cReadOnce(0x05, 1, function() {});

      should.deepEqual(Board.test.i2cActive.get(board), {
        0: {
          stopTX: true,
        },
        5: {
          stopTX: true,
        },
        delay: 0,
      });

      done();
    });

    it("can store arbitrary settings for an i2c peripheral via i2cConfig", function(done) {
      board.i2cConfig({
        address: 0x00,
        settings: {
          whatever: true,
        }
      });

      should.deepEqual(Board.test.i2cActive.get(board), {
        delay: 0,
        0: {
          stopTX: true,
          whatever: true,
        }
      });

      done();
    });

    it("allows stored i2c peripheral settings to be reconfigured via i2cConfig", function(done) {
      board.i2cConfig({
        address: 0x00,
        settings: {
          stopTX: false,
        }
      });

      should.deepEqual(Board.test.i2cActive.get(board), {
        0: {
          stopTX: false,
        },
        delay: 0,
      });

      board.i2cConfig({
        address: 0x00,
        settings: {
          stopTX: true,
        }
      });

      should.deepEqual(Board.test.i2cActive.get(board), {
        delay: 0,
        0: {
          stopTX: true,
        }
      });

      done();
    });

    it("allows an i2c peripheral's stopTX to be overridden", function(done) {
      // var spy = sandbox.spy(board.transport, "write");
      var mask = 0b01001000;

      board.i2cConfig({
        address: 0x00,
        settings: {
          stopTX: true,
        }
      });

      board.i2cReadOnce(0x00, 0x01, 1, function() {});

      should.deepEqual(serialPort.lastWrite, [ 240, 118, 0, 8, 1, 0, 1, 0, 247 ]);

      board.i2cConfig({
        address: 0x00,
        settings: {
          stopTX: false,
        }
      });

      should.deepEqual(Board.test.i2cActive.get(board), {
        0: {
          stopTX: false,
        },
        delay: 0,
      });

      board.i2cReadOnce(0x00, 0x01, 1, function() {});

      should.deepEqual(serialPort.lastWrite, [ 240, 118, 0, 72, 1, 0, 1, 0, 247 ]);

      board.i2cRead(0x00, 0x01, 1, function() {});

      should.deepEqual(serialPort.lastWrite, [ 240, 118, 0, 80, 1, 0, 1, 0, 247 ]);

      done();
    });

    it("has an i2cWrite method, that writes a data array", function(done) {
      var spy = sandbox.spy(serialPort, "write");

      board.i2cConfig(0);
      board.i2cWrite(0x53, [1, 2]);

      should.deepEqual(serialPort.lastWrite, [ 240, 118, 83, 0, 1, 0, 2, 0, 247 ]);
      should.equal(spy.callCount, 2);
      spy.restore();
      done();
    });

    it("has an i2cWrite method, that writes a byte", function(done) {
      var spy = sandbox.spy(serialPort, "write");

      board.i2cConfig(0);
      board.i2cWrite(0x53, 1);

      should.deepEqual(serialPort.lastWrite, [ 240, 118, 83, 0, 1, 0, 247 ]);
      should.equal(spy.callCount, 2);
      spy.restore();
      done();
    });

    it("has an i2cWrite method, that writes a data array to a register", function(done) {
      var spy = sandbox.spy(serialPort, "write");

      board.i2cConfig(0);
      board.i2cWrite(0x53, 0xB2, [1, 2]);

      should.deepEqual(serialPort.lastWrite, [ 240, 118, 83, 0, 50, 1, 1, 0, 2, 0, 247 ]);
      should.equal(spy.callCount, 2);
      spy.restore();
      done();
    });

    it("has an i2cWrite method, that writes a data byte to a register", function(done) {
      var spy = sandbox.spy(serialPort, "write");

      board.i2cConfig(0);
      board.i2cWrite(0x53, 0xB2, 1);

      should.deepEqual(serialPort.lastWrite, [ 240, 118, 83, 0, 50, 1, 1, 0, 247 ]);
      should.equal(spy.callCount, 2);
      spy.restore();
      done();
    });

    it("has an i2cWriteReg method, that writes a data byte to a register", function(done) {
      var spy = sandbox.spy(serialPort, "write");

      board.i2cConfig(0);
      board.i2cWrite(0x53, 0xB2, 1);

      should.deepEqual(serialPort.lastWrite, [ 240, 118, 83, 0, 50, 1, 1, 0, 247 ]);
      should.equal(spy.callCount, 2);
      spy.restore();
      done();
    });

    it("has an i2cRead method that reads continuously", function(done) {
      var handler = sandbox.spy(function() {});

      board.i2cConfig(0);
      board.i2cRead(0x53, 0x04, handler);

      for (var i = 0; i < 5; i++) {
        serialPort.emit("data", [
          START_SYSEX, I2C_REPLY, 83, 0, 0, 0, 1, 0, 2, 0, 3, 0, 4, 0, END_SYSEX
        ]);
      }

      should.equal(handler.callCount, 5);
      should.equal(handler.getCall(0).args[0].length, 4);
      should.equal(handler.getCall(1).args[0].length, 4);
      should.equal(handler.getCall(2).args[0].length, 4);
      should.equal(handler.getCall(3).args[0].length, 4);
      should.equal(handler.getCall(4).args[0].length, 4);

      done();
    });

    it("has an i2cRead method that reads a register continuously", function(done) {
      var handler = sandbox.spy(function() {});

      board.i2cConfig(0);
      board.i2cRead(0x53, 0xB2, 0x04, handler);

      for (var i = 0; i < 5; i++) {
        serialPort.emit("data", [
          START_SYSEX, I2C_REPLY, 83, 0, 50, 1, 1, 0, 2, 0, 3, 0, 4, 0, END_SYSEX
        ]);
      }

      should.equal(handler.callCount, 5);
      should.equal(handler.getCall(0).args[0].length, 4);
      should.equal(handler.getCall(1).args[0].length, 4);
      should.equal(handler.getCall(2).args[0].length, 4);
      should.equal(handler.getCall(3).args[0].length, 4);
      should.equal(handler.getCall(4).args[0].length, 4);

      done();
    });


    it("has an i2cRead method that reads continuously", function(done) {
      var handler = sandbox.spy(function() {});

      board.i2cConfig(0);
      board.i2cRead(0x53, 0x04, handler);

      for (var i = 0; i < 5; i++) {
        serialPort.emit("data", [
          START_SYSEX, I2C_REPLY, 83, 0, 0, 0, 1, 0, 2, 0, 3, 0, 4, 0, END_SYSEX
        ]);
      }

      should.equal(handler.callCount, 5);
      should.equal(handler.getCall(0).args[0].length, 4);
      should.equal(handler.getCall(1).args[0].length, 4);
      should.equal(handler.getCall(2).args[0].length, 4);
      should.equal(handler.getCall(3).args[0].length, 4);
      should.equal(handler.getCall(4).args[0].length, 4);

      done();
    });

    it("has an i2cReadOnce method that reads a register once", function(done) {
      var handler = sandbox.spy(function() {});

      board.i2cConfig(0);
      board.i2cReadOnce(0x53, 0xB2, 0x04, handler);

      // Emit data enough times to potentially break it.
      for (var i = 0; i < 5; i++) {
        serialPort.emit("data", [
          START_SYSEX, I2C_REPLY, 83, 0, 50, 1, 1, 0, 2, 0, 3, 0, 4, 0, END_SYSEX
        ]);
      }

      should.equal(handler.callCount, 1);
      should.equal(handler.getCall(0).args[0].length, 4);
      done();
    });

    it("has an i2cReadOnce method that reads a register once", function(done) {
      var handler = sandbox.spy(function() {});

      board.i2cConfig(0);
      board.i2cReadOnce(0x53, 0xB2, 0x04, handler);

      // Emit data enough times to potentially break it.
      for (var i = 0; i < 5; i++) {
        serialPort.emit("data", [
          START_SYSEX, I2C_REPLY, 83, 0, 50, 1, 1, 0, 2, 0, 3, 0, 4, 0, END_SYSEX
        ]);
      }

      should.equal(handler.callCount, 1);
      should.equal(handler.getCall(0).args[0].length, 4);
      done();
    });
  });

  describe("serial", function() {
    it("can configure a software serial port", function(done) {
      board.serialConfig({
        portId: 0x08,
        baud: 9600,
        rxPin: 10,
        txPin: 11
      });
      serialPort.lastWrite[0].should.equal(START_SYSEX);
      serialPort.lastWrite[2].should.equal(SERIAL_CONFIG | 0x08);

      serialPort.lastWrite[3].should.equal(9600 & 0x007F);
      serialPort.lastWrite[4].should.equal((9600 >> 7) & 0x007F);
      serialPort.lastWrite[5].should.equal((9600 >> 14) & 0x007F);

      serialPort.lastWrite[6].should.equal(10);
      serialPort.lastWrite[7].should.equal(11);

      serialPort.lastWrite[8].should.equal(END_SYSEX);
      done();
    });

    it("can configure a hardware serial port", function(done) {
      board.serialConfig({
        portId: 0x01,
        buad: 57600
      });
      serialPort.lastWrite[2].should.equal(SERIAL_CONFIG | 0x01);

      serialPort.lastWrite[3].should.equal(57600 & 0x007F);
      serialPort.lastWrite[4].should.equal((57600 >> 7) & 0x007F);
      serialPort.lastWrite[5].should.equal((57600 >> 14) & 0x007F);

      serialPort.lastWrite[6].should.equal(END_SYSEX);
      done();
    });

    it("throws an error if no serial port id is passed", function(done) {
      should.throws(function() {
        board.serialConfig({
          buad: 57600
        });
      });
      done();
    });

    it("throws an error if both RX and TX pins are not defined when using Software Serial", function(done) {
      // throw error if both pins are not specified
      should.throws(function() {
        board.serialConfig({
          portId: 8,
          buad: 57600
        });
      });

      // throw error if only one serial pin is specified
      should.throws(function() {
        board.serialConfig({
          portId: 8,
          buad: 57600,
          txPin: 0
        });
      });
      done();
    });

    it("can write a single byte to a serial port", function(done) {
      board.serialWrite(0x08, [1]);
      serialPort.lastWrite[2].should.equal(SERIAL_WRITE | 0x08);
      serialPort.lastWrite[3].should.equal(1 & 0x7F);
      serialPort.lastWrite[4].should.equal((1 >> 7) & 0x7F);
      serialPort.lastWrite[5].should.equal(END_SYSEX);
      done();
    });

    it("can write a byte array to a serial port", function(done) {
      board.serialWrite(0x08, [252, 253, 254]);
      serialPort.lastWrite[2].should.equal(SERIAL_WRITE | 0x08);
      serialPort.lastWrite[3].should.equal(252 & 0x7F);
      serialPort.lastWrite[4].should.equal((252 >> 7) & 0x7F);
      serialPort.lastWrite[7].should.equal(254 & 0x7F);
      serialPort.lastWrite[8].should.equal((254 >> 7) & 0x7F);
      serialPort.lastWrite[9].should.equal(END_SYSEX);
      done();
    });

    it("has a serialRead method that sets READ_CONTINUOUS mode", function(done) {
      var handler = sandbox.spy(function() {});
      board.serialRead(0x08, handler);

      serialPort.lastWrite[2].should.equal(SERIAL_READ | 0x08);
      serialPort.lastWrite[3].should.equal(0);
      serialPort.lastWrite[4].should.equal(END_SYSEX);

      done();
    });

    it("has a serialRead method that reads continuously", function(done) {
      var inBytes = [
        242 & 0x7F,
        (242 >> 7) & 0x7F,
        243 & 0x7F,
        (243 >> 7) & 0x7F,
        244 & 0x7F,
        (244 >> 7) & 0x7F,
      ];

      var handler = sandbox.spy(function() {});
      board.serialRead(0x08, handler);

      for (var i = 0; i < 5; i++) {
        serialPort.emit("data", [
          START_SYSEX,
          SERIAL_MESSAGE,
          SERIAL_REPLY | 0x08,
          inBytes[0],
          inBytes[1],
          inBytes[2],
          inBytes[3],
          inBytes[4],
          inBytes[5],
          END_SYSEX
        ]);
      }

      should.equal(handler.callCount, 5);
      should.equal(handler.getCall(0).args[0].length, 3);
      should.equal(handler.getCall(0).args[0][0], 242);
      should.equal(handler.getCall(0).args[0][2], 244);
      should.equal(handler.getCall(1).args[0].length, 3);
      should.equal(handler.getCall(2).args[0].length, 3);
      should.equal(handler.getCall(3).args[0].length, 3);
      should.equal(handler.getCall(4).args[0].length, 3);
      done();
    });

    it("serialRead accepts an optional maxBytesToRead parameter", function(done) {
      var maxBytesToRead = 4;
      var handler = sandbox.spy(function () {});
      board.serialRead(0x08, maxBytesToRead, handler);

      serialPort.lastWrite[4].should.equal(4);
      serialPort.lastWrite[5].should.equal(0);
      serialPort.lastWrite[6].should.equal(END_SYSEX);
      done();
    });

    it("has a serialStop method that sets STOP_READING mode", function(done) {
      board.serialStop(0x08);
      serialPort.lastWrite[2].should.equal(SERIAL_READ | 0x08);
      serialPort.lastWrite[3].should.equal(1);
      serialPort.lastWrite[4].should.equal(END_SYSEX);
      done();
    });

    it("has a serialClose method", function(done) {
      board.serialClose(0x09);
      serialPort.lastWrite[2].should.equal(SERIAL_CLOSE | 0x09);
      done();
    });

    it("has a serialFlush method", function(done) {
      board.serialFlush(0x02);
      serialPort.lastWrite[2].should.equal(SERIAL_FLUSH | 0x02);
      done();
    });

    it("has a serialListen method that switches software serial port", function(done) {
      var spy = sandbox.spy(serialPort, "write");
      board.serialListen(0x08);
      serialPort.lastWrite[2].should.equal(SERIAL_LISTEN | 0x08);
      serialPort.lastWrite[3].should.equal(END_SYSEX);
      should.equal(spy.callCount, 1);
      spy.restore();
      done();
    });

    it("should not send a SERIAL_LISTEN message for a hardware serial port", function(done) {
      var spy = sandbox.spy(serialPort, "write");
      board.serialListen(0x01);
      should.equal(spy.callCount, 0);
      spy.restore();
      done();
    });

  });

  describe("sysex: custom messages and response handlers", function() {

    it("should allow custom SYSEX_RESPONSE handlers", function(done) {

      should.equal(Board.SYSEX_RESPONSE[NON_STANDARD_REPLY], undefined);

      Board.SYSEX_RESPONSE[NON_STANDARD_REPLY] = function(board) {
        var payload = [];
        var sub = board.currentBuffer[2];

        for (var i = 3, length = board.currentBuffer.length - 1; i < length; i += 2) {
          payload.push(board.currentBuffer[i] | (board.currentBuffer[i + 1] << 7));
        }

        board.emit("non-standard-reply-" + sub, payload);
      };

      // User code may add this emitter
      board.on("non-standard-reply-4", function(payload) {
        should.deepEqual(payload, [0, 1, 2, 3, 4]);
        done();
      });

      // Emit mock data to trigger the NON_STANDARD_REPLY handler
      serialPort.emit("data", [
        //                               SUB   Data...
        START_SYSEX, NON_STANDARD_REPLY, 0x04, 0, 0, 1, 0, 2, 0, 3, 0, 4, 0, END_SYSEX
      ]);
    });

    it("should provide a SAFE API to define custom SYSEX_RESPONSE handlers", function(done) {

      var incoming = [START_SYSEX, NON_STANDARD_REPLY, 0, 0, 1, 0, 2, 0, 3, 0, 4, 0, END_SYSEX];

      board.sysexResponse(NON_STANDARD_REPLY, function(data) {
        // Data does NOT include:
        // [0] START_SYSEX
        // [1] NON_STANDARD_REPLY
        // [n] END_SYSEX

        should.deepEqual(data, [0, 0, 1, 0, 2, 0, 3, 0, 4, 0]);
        should.deepEqual(Board.decode(data), [0, 1, 2, 3, 4]);

        done();
      });

      serialPort.emit("data", incoming);
    });

    it("should allow sending arbitrary sysex commands", function(done) {

      var write = sandbox.stub(serialPort, "write");

      board.sysexCommand([
        I2C_REQUEST, 0x68, 0 << 3, 1 & 0x7F, (1 >> 7) & 0x7F,
      ]);

      var sent = write.lastCall.args[0];

      should.equal(sent[0], START_SYSEX);
      should.equal(sent[1], I2C_REQUEST);
      should.equal(sent[2], 0x68);
      should.equal(sent[3], 0 << 3);
      should.equal(sent[4], 1 & 0x7F);
      should.equal(sent[5], (1 >> 7) & 0x7F);
      should.equal(sent[6], END_SYSEX);

      done();
    });

  });
});

describe("Board.encode/Board.decode", function() {

  describe("Board.encode", function() {
    it("should encode arbitrary data", function(done) {
      should.deepEqual(Board.encode([0, 1, 2, 3, 4]), [0, 0, 1, 0, 2, 0, 3, 0, 4, 0]);
      done();
    });
    it("returns a fresh array", function(done) {
      var data = [];
      should.notEqual(Board.encode(data), data);
      done();
    });
  });
  describe("Board.decode", function() {
    it("should decode arbitrary data", function(done) {
      should.deepEqual(Board.decode([0, 0, 1, 0, 2, 0, 3, 0, 4, 0]), [0, 1, 2, 3, 4]);
      done();
    });

    it("must fail to decode uneven data", function(done) {
      should.throws(function() {
        Board.decode([0, 0, 1, 0, 2, 0, 3, 0, 4]);
      });
      done();
    });

    it("returns a fresh array", function(done) {
      var data = [];
      should.notEqual(Board.decode(data), data);
      done();
    });
  });
});
