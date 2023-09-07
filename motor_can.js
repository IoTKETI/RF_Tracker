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

let zero_flag = 0;
let zero_flag_count = 0;

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
                tidMotor = setTimeout(commMotor, 250);
            }
        }
        else {
            stateMotor = 'toExit';
            if(tidMotor !== null) {
                clearTimeout(tidMotor);
            }
            tidMotor = setTimeout(commMotor, 500);
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
        });
    }
    // else if(stateMotor === 'entering') {
    //     if (motor_return_msg !== '') {
    //         unpack_reply();
    //         mode_counter++;
    //
    //         motor_return_msg = '';
    //
    //         if (mode_counter > 0) {
    //             mode_counter = 0;
    //
    //             console.log('[enter] -> ', p_in, p_out, v_out, t_out);
    //             stateMotor = 'enter';
    //             if(tidMotor !== null) {
    //                 clearTimeout(tidMotor);
    //             }
    //             tidMotor = setTimeout(commMotor, 10);
    //         }
    //         else {
    //             console.log('[entering] :: ', p_in, p_out, v_out, t_out);
    //             stateMotor = 'toEnter';
    //             if(tidMotor !== null) {
    //                 clearTimeout(tidMotor);
    //             }
    //             tidMotor = setTimeout(commMotor, 100);
    //         }
    //     }
    //     else {
    //         stateMotor = 'toEnter';
    //         if(tidMotor !== null) {
    //             clearTimeout(tidMotor);
    //         }
    //         tidMotor = setTimeout(commMotor, 100);
    //     }
    // }
    else if(stateMotor === 'enter') {
        if (motor_return_msg !== '') {
            unpack_reply();

            motor_return_msg = '';

            if(turn_flag === 0 && 1 <= zero_flag_count && zero_flag_count < 5) {
                // console.log('[enter] -> ',
                //     Math.round((g_target) * 1000) / 1000,
                //     Math.round((p_in) * 1000) / 1000,
                //     Math.round((p_out) * 1000) / 1000,
                //     Math.round((p_in - p_out) * 100) / 100);

                 console.log('[enter] -> ',
                //     //Math.round((g_target) * 1000) / 1000,
                     p_in, p_out, p_in - p_out);
                //     //Math.round((p_in - p_out) * 100) / 100);
            }
        }

        if(turn_flag === 1) {
            pack_cmd(() => {
                //console.log('[pack_cmd]', turn_flag, g_target, p_in);

                p_in = turnTarget();

                if(tidMotor !== null) {
                    clearTimeout(tidMotor);
                }
                tidMotor = setTimeout(commMotor, 20);
            });
        }
        else {
            if(zero_flag === 1) {
                zero_flag_count++;
                if(zero_flag_count >= 5) {
                    zero_flag = 0;
                    zero_flag_count = 0;

                    Zero(() => {
                        p_in = 0;
                        g_target = p_in;
                        pack_cmd(() => {
                            if (tidMotor !== null) {
                                clearTimeout(tidMotor);
                            }
                            tidMotor = setTimeout(commMotor, 500);
                        });
                    });
                }
                else {
                    pack_cmd(() => {
                        if(tidMotor !== null) {
                            clearTimeout(tidMotor);
                        }
                        tidMotor = setTimeout(commMotor, 50);
                    });
                }
            }
            else {
                pack_cmd(() => {
                    if(tidMotor !== null) {
                        clearTimeout(tidMotor);
                    }
                    tidMotor = setTimeout(commMotor, 500);
                });
            }

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

let turn_flag = 0;
const DEG = 0.0174533;

const big_th = 10 * DEG;
const big_gap = 0.4 * DEG;

const small_th = 0.05 * DEG;
const small_gap = 0.1 * DEG;

const dir_th = Math.PI;

let turnTarget = () => {
    // let _in = Math.round((p_in) * 1000)/1000;
    // let _target = Math.round((g_target) * 1000)/1000;

    let _in = p_in;
    let _target = g_target;

    let result_in = _in;

    let dir = _target - _in;

    if(dir >= 0) {
        if(dir >= big_th) {
            result_in = _in + big_gap;
        }
        else {
            result_in = _in + small_gap;
        }

        if(result_in >= _target) {
            result_in = _target;
            turn_flag = 0;
            zero_flag = 1;
            zero_flag_count = 0;
            console.log('turnTarget --------------', turn_flag, result_in);
        }
    }
    else {
        if(dir <= -big_th) {
            result_in = _in - big_gap;
        }
        else {
            result_in = _in - small_gap;
        }

        if(result_in <= _target) {
            result_in = _target;
            turn_flag = 0;
            zero_flag = 1;
            zero_flag_count = 0;
            console.log('turnTarget --------------', turn_flag, result_in);
        }
    }

    return result_in;
}

exports.setTarget = (angle) => {
    g_target = Math.round((angle * DEG) * 1000) / 1000;

    let _in = Math.round((p_in) * 1000)/1000;
    let _target = Math.round((g_target) * 1000)/1000;

    // let n_turn = parseInt((_in / (2*Math.PI)).toString());

    let dir = _target - _in;

    if(Math.abs(dir) > dir_th) {
        if(dir < 0) {
            g_target = g_target + (dir_th * 2);
        }
        else {
            g_target = g_target - (dir_th * 2);
        }
    }

    turn_flag = 1;

    // Zero(() => {
    //     p_in = 0.0;
    //     g_target = Math.round((angle * DEG) * 1000) / 1000;
    //     let _in = Math.round((p_in) * 1000)/1000;
    //     let _target = Math.round((g_target) * 1000)/1000;
    //
    //     let dir = _target - _in;
    //
    //     if(Math.abs(dir) > dir_gap) {
    //         g_target = g_target - (dir_gap * 2);
    //     }
    //
    //     turn_flag = 1;
    // });
}

exports.setDelta = (diff_angle) => {
    // g_target = p_in + Math.round((diff_angle * DEG) * 1000) / 1000;
    g_target = p_in + (diff_angle * DEG);
    turn_flag = 1;
}

exports.getAngle = () => {
    return Math.round(((p_out * 180)/Math.PI) * 10)/10;
}

exports.setStop = () => {
    g_target = p_in;
    turn_flag = 1;
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
    /// Converts a float to an unsigned int, given range and number of bits ///
    let span = x_max - x_min;
    if(x < x_min) {
        x = x_min;
    }
    else if(x > x_max) {
        x = x_max;
    }

    return parseInt(((x- x_min)*(((1<<bits)/span))));
}

let uint_to_float = (x_int, x_min, x_max, bits) => {
    /// converts unsigned int to float, given range and number of bits ///
    let span = x_max - x_min;

    return (x_int)*span/(((1<<bits)-1)) + x_min;
}

let pack_cmd = async (callback) => {
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
            await canPort.write(Buffer.from(msg_buf, 'hex'), () => {
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
