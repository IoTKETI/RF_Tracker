const {SerialPort} = require('serialport');

// ---------- set values ----------
let CAN_ID = '00000002';
let MOTOR_CAN_ID = CAN_ID + '0000';

// Value limits ------
const P_MIN = -12.500;
const P_MAX = 12.500;
const V_MIN = -50.000;
const V_MAX = 50.000;
const KP_MIN = 0.000;
const KP_MAX = 500.000;
const KD_MIN = 0.000;
const KD_MAX = 5.000;
const T_MIN = -18.000;
const T_MAX = 18.000;
// -------------------

const p_offset = 0.00;

let p_in = 0.000;
let v_in = 0.000;
let kp_in = 2.000;
let kd_in = 1.000;
let t_in = 0.000;

let p_out = 0.000;
let v_out = 0.000;
let t_out = 0.000;

let g_target = 0.0;

let mode_counter = 0;

let canBaudRate = '9600';
let canPort = null;

let motor_return_msg = '';

//------------- Can communication -------------
exports.canPortOpening = (canPortNum, ID) => {
    CAN_ID = ID;
    MOTOR_CAN_ID = ID + '0000';

    if (canPort == null) {
        canPort = new SerialPort({
            path: canPortNum,
            baudRate: parseInt(canBaudRate, 10),
        });

        canPort.on('open', canPortOpen);
        canPort.on('close', canPortClose);
        canPort.on('error', canPortError);
        canPort.on('data', canPortData);
    }
    else {
        if (canPort.isOpen) {
            canPort.close();
            canPort = null;
            setTimeout(this.canPortOpening, 2000);
        }
        else {
            canPort.open();
        }
    }
}

let canPortOpen = () => {
    console.log('canPort (' + canPort.path + '), canPort rate: ' + canPort.baudRate + ' open.');
}

let canPortClose = () => {
    console.log('[pan] canPort closed.');

    setTimeout(this.canPortOpening, 2000);
}

let canPortError = (error) => {
    console.log('[pan] canPort error : ' + error);

    setTimeout(this.canPortOpening, 2000);
}

let _msg = '';

let canPortData = (data) => {
    _msg += data.toString('hex').toLowerCase();

    if (_msg.length >= 24) {
        if (_msg.substring(0, 10) === ('00' + CAN_ID)) {
            motor_return_msg = _msg.substring(0, 24);
            _msg = _msg.substring(24);
        }
        else {
            console.log('[canPortData] diff ID - msgid =>', _msg.substring(0, 10), 'CAN_ID =>', '00' + CAN_ID);
        }
    }
}

//---------------------------------------------------

this.canPortOpening('/dev/ttyAMA1',canBaudRate);

let setTheBaudrateUART = (callback) => {
    if (canPort !== null) {
        if (canPort.isOpen) {
            canPort.write("AT+S=4\n", () => {
                callback();
            });
        }
    }
}

setTimeout(() => {
    setTheBaudrateUART(() => {
        console.log('AT+S=4');
    })
}, 5000);
