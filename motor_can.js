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

const p_offset = 0.24;

let p_in = 0.000;
let v_in = 0.000;
let kp_in = 20.000;
let kd_in = 1.000;
let t_in = 0.000;

let p_out = 0.000;
let v_out = 0.000;
let t_out = 0.000;

let g_target = 0.0;

let mode_counter = 0;

let canBaudRate = '115200';
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

let stateMotor = 'toExit';
let tidMotor = null;
exports.loop = () => {
    tidMotor = setTimeout(commMotor, 2000, p_in);
}

let commMotor = () => {
    if(stateMotor === 'toExit') {
        ExitMotorMode(() => {
            stateMotor = 'exiting';
            if(tidMotor !== null) {
                clearTimeout(tidMotor);
            }
            tidMotor = setTimeout(commMotor, 10);
        });
    }
    else if(stateMotor === 'exiting') {
        if (motor_return_msg !== '') {
            unpack_reply();
            mode_counter++;

            motor_return_msg = '';

            p_in = p_out;

            if (mode_counter > 5) {
                mode_counter = 0;

                console.log('[exit] -> ', p_in, p_out, v_out, t_out);
                stateMotor = 'exit';
                if(tidMotor !== null) {
                    clearTimeout(tidMotor);
                }
                tidMotor = setTimeout(commMotor, 10);
            }
            else {
                console.log('[exiting] :: ', p_in, p_out, v_out, t_out);
                stateMotor = 'toExit';
                if(tidMotor !== null) {
                    clearTimeout(tidMotor);
                }
                tidMotor = setTimeout(commMotor, 200);
            }
        }
        else {
            stateMotor = 'toExit';
            if(tidMotor !== null) {
                clearTimeout(tidMotor);
            }
            tidMotor = setTimeout(commMotor, 100);
        }
    }
    else if(stateMotor === 'exit') {
        if(tidMotor !== null) {
            clearTimeout(tidMotor);
        }
        tidMotor = setTimeout(commMotor, 100);
    }
    else if(stateMotor === 'toEnter') {
        EnterMotorMode(() => {
            g_target = p_in;
            pack_cmd(() => {
                stateMotor = 'entering';
                if(tidMotor !== null) {
                    clearTimeout(tidMotor);
                }
                tidMotor = setTimeout(commMotor, 10);
            });
        });
    }
    else if(stateMotor === 'entering') {
        if (motor_return_msg !== '') {
            unpack_reply();
            mode_counter++;

            motor_return_msg = '';

            if (mode_counter > 0) {
                mode_counter = 0;

                console.log('[enter] -> ', p_in, p_out, v_out, t_out);
                stateMotor = 'enter';
                if(tidMotor !== null) {
                    clearTimeout(tidMotor);
                }
                tidMotor = setTimeout(commMotor, 10);
            }
            else {
                console.log('[entering] :: ', p_in, p_out, v_out, t_out);
                stateMotor = 'toEnter';
                if(tidMotor !== null) {
                    clearTimeout(tidMotor);
                }
                tidMotor = setTimeout(commMotor, 100);
            }
        }
        else {
            stateMotor = 'toEnter';
            if(tidMotor !== null) {
                clearTimeout(tidMotor);
            }
            tidMotor = setTimeout(commMotor, 100);
        }
    }
    else if(stateMotor === 'enter') {
        if (motor_return_msg !== '') {
            unpack_reply();

            motor_return_msg = '';

            if(Math.abs(Math.round((p_in - p_out) * 100)/100) > 0.2) {
                console.log('[enter] -> [', enter_mode_counter, '] ',
                    Math.round((g_target) * 1000) / 1000,
                    Math.round((p_in) * 1000) / 1000,
                    Math.round((p_out) * 1000) / 1000,
                    Math.round((p_in - p_out) * 100) / 100);
            }

        }

        if(turn_flag === 1) {

            if(Math.abs(Math.round((p_in - p_out) * 100)/100) > 0.3) {
                console.log('===================================================================')
            }

            p_in = turnTarget(p_in, g_target);
            pack_cmd(() => {
                console.log('[pack_cmd]', p_in);
            });

            if(tidMotor !== null) {
                clearTimeout(tidMotor);
            }
            tidMotor = setTimeout(commMotor, 1000);
        }
        else {
            // EnterMotorMode(() => {
            //     g_target = _in;
            //     pack_cmd(_in, () => {
            //         if(tidMotor !== null) {
            //             clearTimeout(tidMotor);
            //         }
            //         tidMotor = setTimeout(commMotor, 1000, _in);
            //     });
            // });

            pack_cmd(() => {
                if(tidMotor !== null) {
                    clearTimeout(tidMotor);
                }
                tidMotor = setTimeout(commMotor, 500);
            });
            //
            // if(tidMotor !== null) {
            //     clearTimeout(tidMotor);
            // }
            // tidMotor = setTimeout(commMotor, 150, _in);
        }
    }
    else if(stateMotor === 'toZero') {
        Zero(() => {
            p_in = 0.0;
            g_target = p_in;
            pack_cmd(() => {
                stateMotor = 'zeroing';
                if(tidMotor !== null) {
                    clearTimeout(tidMotor);
                }
                tidMotor = setTimeout(commMotor, 10);
            });
        });
    }
    else if(stateMotor === 'zeroing') {
        if (motor_return_msg !== '') {
            unpack_reply();
            mode_counter++;

            motor_return_msg = '';

            if (mode_counter > 1) {
                mode_counter = 0;

                console.log('[enter] -> ', p_in, p_out, v_out, t_out);
                stateMotor = 'enter';
                if(tidMotor !== null) {
                    clearTimeout(tidMotor);
                }
                tidMotor = setTimeout(commMotor, 10);
            }
            else {
                console.log('[zeroing] :: ', p_in, p_out, v_out, t_out);
                stateMotor = 'toZero';
                if(tidMotor !== null) {
                    clearTimeout(tidMotor);
                }
                tidMotor = setTimeout(commMotor, 100);
            }
        }
        else {
            stateMotor = 'toZero';
            if(tidMotor !== null) {
                clearTimeout(tidMotor);
            }
            tidMotor = setTimeout(commMotor, 100);
        }
    }
}

exports.getState = () => {
    return stateMotor;
}

exports.setState = (state) => {
    stateMotor = state;
    console.log('[setState] -> ', stateMotor);
}


let S = 1;
let P = () => {
    while(S === 0) {
        console.log('.............waiting................................................');
    }

    S -= 1;
}

let V = () => {
    S += 1;
}

let turn_flag = 0;
const big_gap = 9 * 0.0174533;
const small_gap = 0.9 * 0.00174533;

let turnTarget = (_in, _target, callback) => {
    _in = Math.round((_in) * 1000)/1000;
    _target = Math.round((_target) * 1000)/1000;

    let result_in = _in;

    let dir = _target - _in;
    if(dir >= 0) {
        if(dir >= big_gap) {
            result_in = _in + big_gap;
        }
        else {
            result_in = _in + small_gap;
            if(result_in >= _target) {
                result_in = _target;
                turn_flag = 0;
            }
        }
    }
    else {
        if(dir <= -big_gap) {
            result_in = _in - big_gap;
        }
        else {
            result_in = _in - small_gap;
            if(result_in <= _target) {
                result_in = _target;
                turn_flag = 0;
            }
        }
    }

    return result_in;
}

let turnTarget_old = (_in, _target, callback) => {
    let result_in = Math.round((_in) * 1000)/1000;
    _target = Math.round((_target) * 1000)/1000;
    let target_angle = Math.round(((_target * 180)/Math.PI) * 10)/10;
    if(target_angle <= 0) {
        target_angle += 360;
    }
    target_angle %= 360;

    let cur_angle = Math.round(((_in * 180)/Math.PI) * 10)/10;
    if(cur_angle <= 0) {
        cur_angle += 360;
    }
    cur_angle %= 360;

    target_angle += 360;
    cur_angle += 360;

    let p_diff = 0;
    let diff1 = (target_angle - cur_angle);
    let diff2 = 0;
    if(diff1 > 0) {
        diff2 = diff1 - 360;
    }
    else {
        diff2 = diff1 + 360;
    }

    if(Math.abs(diff1) >= Math.abs(diff2)) {
        p_diff = diff2;
    }
    else {
        p_diff = diff1;
    }

    if (p_diff < -15) {
        result_in = _in - (3.1 * 0.0174533);
        if(result_in <= _target) {
            result_in = _target;
        }
    }
    else if (-15 <= p_diff && p_diff < -5) {
        result_in = _in - (2.1 * 0.0174533);
        if(result_in <= _target) {
            result_in = _target;
        }
    }
    else if (-5 <= p_diff && p_diff < -0.5) {
        result_in = _in - (1.1 * 0.0174533);
        if(result_in <= _target) {
            result_in = _target;
        }
    }
    else if (-0.5 <= p_diff && p_diff < 0.5) {
        turn_flag = 0;

        console.log('<------------------------------------------->');

        result_in = _target;
    }
    else if (0.5 <= p_diff && p_diff < 5) {
        result_in = _in + (1.1 * 0.0174533);
        if(result_in >= _target) {
            result_in = _target;
        }
    }
    else if (5 <= p_diff && p_diff < 15) {
        result_in = _in + (2.1 * 0.0174533);
        if(result_in >= _target) {
            result_in = _target;
        }
    }
    else if (15 <= p_diff) {
        result_in = _in + (3.1 * 0.0174533);
        if(result_in >= _target) {
            result_in = _target;
        }
    }

    return result_in;
}

let enter_mode_counter = 0;
exports.setTarget = (angle) => {
    g_target = angle * 0.0174533;
    enter_mode_counter = 0;
    turn_flag = 1;
    if(tidMotor !== null) {
        clearTimeout(tidMotor);
    }
    tidMotor = setTimeout(commMotor, 0, p_in);
}

exports.setDelta = (diff_angle) => {
    g_target = p_in + (diff_angle * 0.0174533);
    turn_flag = 1;
}

exports.getAngle = () => {
    return Math.round(((p_out * 180)/Math.PI) * 10)/10;
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

let pack_cmd = (callback) => {
    let p_des = constrain((p_in+p_offset), P_MIN, P_MAX);
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

    let msg_buf = MOTOR_CAN_ID + p_int_hex + v_int_hex + kp_int_hex + kd_int_hex + t_int_hex;
    //console.log('Can Port Send Data ===> ' + msg_buf);

    if (canPort !== null) {
        if (canPort.isOpen) {
            canPort.write(Buffer.from(msg_buf, 'hex'), () => {
                // console.log('can write =>', msg_buf);
            });
        }
    }

    callback();
}

let unpack_reply = () => {
    try {
        let id = parseInt(motor_return_msg.substring(9, 10), 16);
        if (id === parseInt(CAN_ID, 16)) {
            let p_int = parseInt(motor_return_msg.substring(10, 14), 16);
            let v_int = parseInt(motor_return_msg.substring(14, 17), 16);
            let i_int = parseInt(motor_return_msg.substring(17, 20), 16);

            p_out = uint_to_float(p_int, P_MIN, P_MAX, 16);
            v_out = uint_to_float(v_int, V_MIN, V_MAX, 12);
            t_out = uint_to_float(i_int, T_MIN, T_MAX, 12);
        }
        else {
            console.log('[unpack_reply] diff ID - msgid =>', id, 'CAN_ID =>', CAN_ID);
        }
    }
    catch (e) {
        console.log('[unpack_reply] Error -', e);
    }
}

//--------------- CAN special message ---------------
let EnterMotorMode = (callback) => {
    if (canPort !== null) {
        if (canPort.isOpen) {
            canPort.write(Buffer.from(MOTOR_CAN_ID + 'FFFFFFFFFFFFFFFC', 'hex'), () => {
                console.log(MOTOR_CAN_ID + 'FFFFFFFFFFFFFFFC');
                callback();
            });
        }
    }
}

let ExitMotorMode = (callback) => {
    if (canPort !== null) {
        if (canPort.isOpen) {
            canPort.write(Buffer.from(MOTOR_CAN_ID + 'FFFFFFFFFFFFFFFD', 'hex'), () => {
                console.log(MOTOR_CAN_ID + 'FFFFFFFFFFFFFFFD');
                callback();
            });
        }
    }
}

let Zero = (callback) => {
    if (canPort !== null) {
        if (canPort.isOpen) {
            canPort.write(Buffer.from(MOTOR_CAN_ID + 'FFFFFFFFFFFFFFFE', 'hex'), () => {
                console.log(MOTOR_CAN_ID + 'FFFFFFFFFFFFFFFE');
                callback();
            });
        }
    }
}

//---------------------------------------------------
