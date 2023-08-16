const {SerialPort} = require('serialport');

// ---------- set values ----------
const PAN_CAN_ID = '000000010000';

// Value limits ------
const P_MIN = -12.500;
const P_MAX = 12.500;
const V_MIN = -65.000;
const V_MAX = 65.000;
const KP_MIN = 0.000;
const KP_MAX = 500.000;
const KD_MIN = 0.000;
const KD_MAX = 5.000;
const T_MIN = -18.000;
const T_MAX = 18.000;
// -------------------

let p_offset = 0.24;

let p_in = 0.000 + p_offset;
let v_in = 0.000;
let kp_in = 20.000;
let kd_in = 1.000;
let t_in = 0.000;

let p_out = 0.000;
let v_out = 0.000;
let t_out = 0.000;

let p_step = 0.005;
let p_target = 0.0;

let motormode = 2;
let run_flag = '';
let exit_mode_counter = 0;
let no_response_count = 0;

let canBaudRate = '115200';
let canPort = null;

let motor_return_msg = '';

//------------- Can communication -------------
exports.canPortOpening = function (canPortNum)
{
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

function canPortOpen() {
    console.log('canPort (' + canPort.path + '), canPort rate: ' + canPort.baudRate + ' open.');
}

function canPortClose() {
    console.log('[pan] canPort closed.');

    setTimeout(this.canPortOpening, 2000);
}

function canPortError(error) {
    console.log('[pan] canPort error : ' + error);

    setTimeout(this.canPortOpening, 2000);
}

let _msg = '';

function canPortData(data) {
    _msg += data.toString('hex').toLowerCase();

    if (_msg.length >= 24) {
        if (_msg.substring(0, 10) === '0000000001') {
            motor_return_msg = _msg.substring(0, 24);
            _msg = _msg.substring(24, _msg.length);
        }
    }
}

//---------------------------------------------------

let stateMotor = 'toExit';
let enter_mode_counter = 0;

exports.loop = function () {
    setTimeout(commMotor, 1000);
}

function commMotor() {
    if(stateMotor === 'toExit') {
        ExitMotorMode();

        stateMotor = 'exiting';
        setTimeout(commMotor, 50);
    }
    else if(stateMotor === 'exiting') {
        if (motor_return_msg !== '') {
            unpack_reply();
            exit_mode_counter++;

            motor_return_msg = '';
            p_in = p_out + p_offset;

            if (exit_mode_counter > 4) {
                exit_mode_counter = 0;

                console.log('[exit] -> ', p_in, p_out, v_out, t_out);
                stateMotor = 'exit';
            }
            else {
                console.log('[exiting] :: ', p_in, p_out, v_out, t_out);
                stateMotor = 'toExit';
            }
        }
        else {
            stateMotor = 'toExit';
        }

        setTimeout(commMotor, 250);
    }
    else if(stateMotor === 'exit') {
        setTimeout(commMotor, 250);
    }
    else if(stateMotor === 'toEnter') {
        EnterMotorMode();
        p_step = 0.0;
        p_target = p_in;
        pack_cmd();

        //stateMotor = 'enter';
        //setTimeout(commMotor, 5);

        // Zero();
        // p_in = 0 + p_offset;

        stateMotor = 'enter';
        setTimeout(commMotor, 0);
    }
    else if(stateMotor === 'enter') {
        P();
        if (motor_return_msg !== '') {
            unpack_reply();
            enter_mode_counter++;

            motor_return_msg = '';

            let target_angle = ((p_target-p_offset) * 180)/Math.PI;
            if(target_angle < 0) {
                target_angle += 360;
            }

            let cur_angle = ((p_in-p_offset) * 180)/Math.PI;
            if(cur_angle < 0) {
                cur_angle += 360;
            }

            console.log('[enter] -> ', '(', target_angle.toFixed(1), ')', p_target, '(', cur_angle.toFixed(1), ')', p_in, p_out, v_out, t_out);
        }

        let p_diff = (p_target - p_in) * (180 / 3.14);
        if(p_diff < -15) {
            p_step = -0.015;
        }
        else if(-15 <= p_diff && p_diff < -5) {
            p_step = -0.010;
        }
        else if(-5 <= p_diff && p_diff < -0.2) {
            p_step = -0.005;
        }
        else if(-0.2 <= p_diff && p_diff < 0.2) {
            p_step = 0.000;
        }
        else if(0.2 <= p_diff && p_diff < 5) {
            p_step = 0.005;
        }
        else if(5 <= p_diff && p_diff < 15) {
            p_step = 0.010;
        }
        else if(15 <= p_diff) {
            p_step = 0.015;
        }

        if(p_step !== 0) {
            p_in = p_in + p_step;
            pack_cmd();
        }
        V();

        setTimeout(commMotor, 50);
    }
    else if(stateMotor === 'toZero') {
        Zero();
        p_in = 0.24;
        p_step = 0.0;
        p_target = p_in;
        pack_cmd();

        //p_in = 0 + p_offset;

        stateMotor = 'enter';
        setTimeout(commMotor, 0);
    }
}

exports.getState = function () {
    return stateMotor;
}

exports.setState = function (state) {
    stateMotor = state;
    console.log('[setState] -> ', stateMotor);
}

exports.setTarget = function (angle) {
    if(angle < 0) {
        angle += 360;
    }

    let ori_p_in = p_in;
    if(ori_p_in < 0) {
        ori_p_in = ori_p_in + (2 * Math.PI);
    }
    let cur_angle = ((ori_p_in * 180)/Math.PI);

    let diff = (angle - cur_angle);
    this.setDelta(diff);
}

let S = 1;
function P() {
    while(S === 0) {
        console.log('waiting................................................');
    }

    S -= 1;
}

function V() {
    S += 1;
}

exports.setDelta = function (angle) {
    P();
    p_target = p_in + (angle * 0.0174533 + p_offset);
    V();
}

let constrain = (_in, _min, _max) => {
    if (_in < _min) {
        return _min;
    }
    else if (_in > _max) {
        return _max;
    }
    else {
        return _in;
    }
}

let initAction = () => {
    setTimeout(() => {
        motor_control_message = 'zero';

        setTimeout(() => {
            if (tracker_heading !== 0) {
                if (tracker_heading > 180) {
                    motor_control_message = 'go' + (tracker_heading - 360);
                }
                else if (tracker_heading < 180) {
                    motor_control_message = 'go' + tracker_heading * (-1);
                }
                setTimeout(() => {
                    motor_control_message = 'zero';
                }, 10000);
            }


            // setTimeout(() => {
            //     motor_control_message = 'pan_down';

            //     setTimeout(() => {
            //         motor_control_message = 'stop';
            //     }, 2000);
            // }, 2000);
        }, 1000);
    }, 500);
}

let float_to_uint = (x, x_min, x_max, bits) => {
    let span = x_max - x_min;
    let offset = x_min;
    let pgg = 0;
    if (bits === 12) {
        pgg = (x - offset) * 4095.0 / span;
    }
    else if (bits === 16) {
        pgg = (x - offset) * 65535.0 / span;
    }

    return parseInt(pgg);
}

let uint_to_float = (x_int, x_min, x_max, bits) => {
    let span = x_max - x_min;
    let offset = x_min;
    let pgg = 0;
    if (bits === 12) {
        pgg = parseFloat(x_int) * span / 4095.0 + offset;
    }
    else if (bits === 16) {
        pgg = parseFloat(x_int) * span / 65535.0 + offset;
    }

    return parseFloat(pgg);
}

function pack_cmd() {
    let p_des = constrain(p_in, P_MIN, P_MAX);
    let v_des = constrain(v_in, V_MIN, V_MAX);
    let kp = constrain(kp_in, KP_MIN, KP_MAX);
    let kd = constrain(kd_in, KD_MIN, KD_MAX);
    let t_ff = constrain(t_in, T_MIN, T_MAX);

    let p_int = float_to_uint(p_des, P_MIN, P_MAX, 16);
    let v_int = float_to_uint(v_des, P_MIN, P_MAX, 12);
    let kp_int = float_to_uint(kp, P_MIN, P_MAX, 12);
    let kd_int = float_to_uint(kd, P_MIN, P_MAX, 12);
    let t_int = float_to_uint(t_ff, T_MIN, T_MAX, 12);

    let p_int_hex = p_int.toString(16).padStart(4, '0');
    let v_int_hex = v_int.toString(16).padStart(3, '0');
    let kp_int_hex = kp_int.toString(16).padStart(3, '0');
    let kd_int_hex = kd_int.toString(16).padStart(3, '0');
    let t_int_hex = t_int.toString(16).padStart(3, '0');

    let msg_buf = PAN_CAN_ID + p_int_hex + v_int_hex + kp_int_hex + kd_int_hex + t_int_hex;
    //console.log('Can Port Send Data ===> ' + msg_buf);

    if (canPort !== null) {
        if (canPort.isOpen) {
            canPort.write(Buffer.from(msg_buf, 'hex'), () => {
                // console.log('can write =>', msg_buf);
            });
        }
    }
}

let unpack_reply = () => {
    try {
        let id = parseInt(motor_return_msg.substring(9, 10), 16);
        if (id === 1) {
            let p_int = parseInt(motor_return_msg.substring(10, 14), 16);
            let v_int = parseInt(motor_return_msg.substring(14, 17), 16);
            let i_int = parseInt(motor_return_msg.substring(17, 20), 16);

            p_out = uint_to_float(p_int, P_MIN, P_MAX, 16);
            v_out = uint_to_float(v_int, V_MIN, V_MAX, 12);
            t_out = uint_to_float(i_int, T_MIN, T_MAX, 12);
        }
    }
    catch {

    }
}

//--------------- CAN special message ---------------
function EnterMotorMode() {
    if (canPort !== null) {
        if (canPort.isOpen) {
            canPort.write(Buffer.from(PAN_CAN_ID + 'FFFFFFFFFFFFFFFC', 'hex'), () => {
                console.log(PAN_CAN_ID + 'FFFFFFFFFFFFFFFC');
            });
        }
    }
}

function ExitMotorMode() {
    if (canPort !== null) {
        if (canPort.isOpen) {
            canPort.write(Buffer.from(PAN_CAN_ID + 'FFFFFFFFFFFFFFFD', 'hex'), () => {
                // console.log(PAN_CAN_ID + 'FFFFFFFFFFFFFFFD');
            });
        }
    }
}

function Zero() {
    if (canPort !== null) {
        if (canPort.isOpen) {
            canPort.write(Buffer.from(PAN_CAN_ID + 'FFFFFFFFFFFFFFFE', 'hex'), () => {
                // console.log(PAN_CAN_ID + 'FFFFFFFFFFFFFFFE');
            });
        }
    }
}

//---------------------------------------------------

function calcTargetPanAngle(targetLatitude, targetLongitude) {
    //console.log('[pan] tracker_latitude, tracker_longitude, tracker_relative_altitude: ', tracker_latitude,
    // tracker_longitude, tracker_relative_altitude); console.log('[pan] targetLatitude, targetLongitude: ',
    // targetLatitude, targetLongitude);

    let target_latitude_rad = targetLatitude * Math.PI / 180;
    let target_longitude_rad = targetLongitude * Math.PI / 180;

    let tracker_latitude_rad = tracker_latitude * Math.PI / 180;
    let tracker_longitude_rad = tracker_longitude * Math.PI / 180;

    let y = Math.sin(target_longitude_rad - tracker_longitude_rad) * Math.cos(target_latitude_rad);
    let x = Math.cos(tracker_latitude_rad) * Math.sin(target_latitude_rad) - Math.sin(tracker_latitude_rad) * Math.cos(target_latitude_rad) * Math.cos(target_longitude_rad - tracker_longitude_rad);
    let angle = Math.atan2(y, x); // azimuth angle (radians)

    angle = (angle + p_offset) * 180 / Math.PI;
    return Math.round(angle);

    // let turn_target = Math.round((angle + p_offset) * 50) / 50;  // 0.5단위 반올림
    // turn_angle = (turn_target * 180 / Math.PI + 360) % 360; // azimuth angle (convert to degree)

    // turn_angle = turn_angle - tracker_heading;
    // if (run_flag === 'reset') {
    //     run_flag = 'go';
    //     motor_control_message = 'run';
    // }
    // else if (run_flag === 'go') {
    //     if (parseInt(Math.abs(cur_angle)) === 360) {
    //         motor_control_message = 'zero';
    //         cur_angle = 0;
    //         run_flag = 'reset';
    //     }

    //     if (turn_angle < 0) {
    //         temp_angle = turn_angle + 360;
    //     }
    //     else {
    //         temp_angle = turn_angle;
    //     }

    //     if (temp_angle - cur_angle < 0) {
    //         cw = 360 - cur_angle + temp_angle;
    //         ccw = (360 - cw) * (-1);
    //     }
    //     else {
    //         if (temp_angle - cur_angle >= 360) {
    //             cw = temp_angle - cur_angle - 360;
    //             ccw = (360 - cw) * (-1);
    //         }
    //         else {
    //             cw = temp_angle - cur_angle;
    //             ccw = (360 - cw) * (-1);
    //         }
    //     }

    //     if (Math.abs(cw) <= Math.abs(ccw)) {
    //         p_target = (cur_angle + cw) * 0.0174533 + p_offset;
    //     }
    //     else {
    //         p_target = (cur_angle + ccw) * 0.0174533 + p_offset;
    //     }
    //     cur_angle = (p_target - p_offset) * 180 / Math.PI;

    //     // console.log('-------------------------------');
    //     // console.log('turnAngle: ', turnAngle);
    //     // console.log('cur_angle: ', cur_angle);
    //     // console.log('temp_angle: ', temp_angle);
    //     // console.log('cw, ccw: ', cw, ccw);
    //     // console.log('p_target: ', p_target);
    //     // console.log('-------------------------------');
    // }
}
