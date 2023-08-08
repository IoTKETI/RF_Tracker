const mqtt = require('mqtt');
const {nanoid} = require("nanoid");
const {SerialPort} = require('serialport');

// ---------- set values ----------
const TILT_CAN_ID = '000000020000';

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

let p_step = 0.01;
let p_target = 0.0;

let cw = 0;
let ccw = 0;
let cur_angle = 0;
let temp_angle = 0;
let turn_angle = 0.0;
let target_angle = 0.0;

let motormode = 2;
let run_flag = '';
let exit_mode_counter = 0;
let no_response_count = 0;

let canPortNum = '/dev/ttyAMA2';
let canBaudRate = '115200';
let canPort = null;

let local_mqtt_client = null;

let localmqtt_message = '';
let motor_control_message = '';
let motor_altitude_message = '';
let tracker_gpi = '';
let tracker_att = '';


let tracker_latitude = 37.4036621604629;
let tracker_longitude = 127.16176249708046;
let tracker_altitude = 0.0;
let tracker_relative_altitude = 0.0;
let tracker_heading = 0.0;

let tracker_roll = 0.0;
let tracker_pitch = 0.0;
let tracker_yaw = 0.0;

let target_gpi = {};

let target_latitude = '';
let target_longitude = '';
let target_altitude = '';
let target_relative_altitude = '';

let motor_return_msg = '';

let sub_drone_data_topic = '/Ant_Tracker/target_drone/gpi';
let sub_motor_control_topic = '/Ant_Tracker/Control';
let sub_motor_altitude_topic = '/Ant_Tracker/Altitude';
//let sub_gps_location_topic = '/GPS/location';
let sub_gps_attitude_topic = '/GPS/attitude';

let pub_motor_position_topic = '/Ant_Tracker/Motor_Tilt';

//------------- Can communication -------------
function canPortOpening() {
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
            setTimeout(canPortOpening, 2000);
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
    console.log('[tilt] canPort closed.');

    setTimeout(canPortOpening, 2000);
}

function canPortError(error) {
    console.log('[tilt] canPort error : ' + error);

    setTimeout(canPortOpening, 2000);
}

let _msg = '';

function canPortData(data) {
    _msg += data.toString('hex').toLowerCase();

    if (_msg.length >= 24) {
        if (_msg.substring(0, 10) === '0000000002') {
            motor_return_msg = _msg.substring(0, 24);
            _msg = _msg.substring(24, _msg.length);
            // console.log('motor_return_msg: ', motor_return_msg);
        }
    }
}

//---------------------------------------------------

//------------- local mqtt connect ------------------
function local_mqtt_connect(host) {
    let connectOptions = {
        host: host,
        port: 1883,
        protocol: "mqtt",
        keepalive: 10,
        clientId: 'local_tilt_motor_' + nanoid(15),
        protocolId: "MQTT",
        protocolVersion: 4,
        clean: true,
        reconnectPeriod: 2 * 1000,
        connectTimeout: 30 * 1000,
        queueQoSZero: false,
        rejectUnauthorized: false
    }

    local_mqtt_client = mqtt.connect(connectOptions);

    local_mqtt_client.on('connect', function () {
        if (sub_drone_data_topic !== '') {
            local_mqtt_client.subscribe(sub_drone_data_topic, () => {
                console.log('[local_mqtt] sub_drone_data_topic is subscribed -> ', sub_drone_data_topic);
            });
        }
        // if (sub_gps_location_topic !== '') {
        //     local_mqtt_client.subscribe(sub_gps_location_topic, () => {
        //         console.log('[local_mqtt] sub_gps_location_topic is subscribed -> ', sub_gps_location_topic);
        //     });
        // }
        if (sub_gps_attitude_topic !== '') {
            local_mqtt_client.subscribe(sub_gps_attitude_topic, () => {
                console.log('[local_mqtt] sub_gps_attitude_topic is subscribed -> ', sub_gps_attitude_topic);
            });
        }
        if (sub_motor_control_topic !== '') {
            local_mqtt_client.subscribe(sub_motor_control_topic, () => {
                console.log('[local_mqtt] sub_motor_control_topic is subscribed -> ', sub_motor_control_topic);
            });
        }
        if (sub_motor_altitude_topic !== '') {
            local_mqtt_client.subscribe(sub_motor_altitude_topic, () => {
                console.log('[local_mqtt] sub_motor_altitude_topic is subscribed -> ', sub_motor_altitude_topic);
            });
        }

        runMotor();
    });

    local_mqtt_client.on('message', (topic, message) => {
        // console.log('topic, message => ', topic, message);

        if (topic === sub_motor_control_topic) { // 모터 제어 메세지 수신
            motor_control_message = message.toString();
            // console.log(topic, motor_control_message);
        }
        else if (topic === sub_motor_altitude_topic) {
            motor_altitude_message = message.toString();
            if (typeof (parseInt(motor_altitude_message)) === 'number') {
                tracker_relative_altitude = motor_altitude_message;
            }
        }
            // else if (topic === sub_gps_location_topic) { // 픽스호크로부터 받아오는 트래커 위치 좌표
            //     tracker_gpi = JSON.parse(message.toString());
            //
            //     tracker_latitude = tracker_gpi.lat;
            //     tracker_longitude = tracker_gpi.lon;
            //     tracker_altitude = tracker_gpi.alt;
            //     tracker_relative_altitude = tracker_gpi.relative_alt;
            //     tracker_heading = Math.round(tracker_gpi.hdg) - 180;
            //     console.log('tracker_gpi: ', tracker_latitude, tracker_longitude, tracker_relative_altitude,
            //         tracker_heading);
        // }
        else if (topic === sub_drone_data_topic) { // 드론데이터 수신
            target_gpi = JSON.parse(message.toString());

            target_latitude = target_gpi.lat / 10000000;
            target_longitude = target_gpi.lon / 10000000;
            target_altitude = target_gpi.alt / 1000;
            target_relative_altitude = target_gpi.relative_alt / 1000;
            console.log('target_gpi: ', JSON.stringify(target_gpi));

            if (run_flag === 'go') {
                target_angle = calcTargetTiltAngle(target_latitude, target_longitude, target_relative_altitude);
                // console.log('myPitch, target_angle', myPitch, target_angle);

                if (Math.abs(target_angle - tracker_pitch) > 10) {
                    p_step = 0.02;
                }
                else if (Math.abs(target_angle - tracker_pitch) > 5) {
                    p_step = 0.01;
                }
                else if (Math.abs(target_angle - tracker_pitch) > 3) {
                    p_step = 0.005;
                }
                else {
                    p_step = 0.001;
                }

                if (tracker_pitch !== target_angle) {
                    cw = target_angle - tracker_pitch;
                    if (cw < 0) {
                        cw = cw + 360;
                    }
                    ccw = 360 - cw;

                    if (cw < ccw) {
                        p_in = p_in + p_step;
                    }
                    else if (cw > ccw) {
                        p_in = p_in - p_step;
                    }
                    else {
                        p_in = p_in;
                    }
                }
                p_step = 0.02;
            }
        }
        else if (topic === sub_gps_attitude_topic) {
            tracker_att = JSON.parse(message.toString());

            tracker_roll = tracker_att.roll;
            tracker_pitch = Math.round(tracker_att.pitch);
            tracker_yaw = tracker_att.yaw;
            console.log('tracker_att: ', tracker_roll, tracker_pitch, tracker_yaw);
        }
    });

    local_mqtt_client.on('error', function (err) {
        console.log('[tilt] local mqtt connect error ' + err.message);
    });
}

//---------------------------------------------------

function runMotor() {
    setTimeout(() => {
        setInterval(() => {
            if (motor_control_message === 'on') {
                EnterMotorMode();
                motormode = 1;
                motor_control_message = '';
            }
            else if (motor_control_message === 'off') {
                ExitMotorMode();
                motormode = 0;
                motor_control_message = '';
                run_flag = '';
            }
            else if (motor_control_message === 'zero') {
                Zero();
                p_in = 0 + p_offset;
                motor_control_message = '';
            }
            else if (motor_control_message === 'init') {
                if (motormode !== 1) {
                    EnterMotorMode();

                    motormode = 1;
                    motor_control_message = 'zero';
                }
                else {
                    motor_control_message = 'zero';
                }
            }

            if (motormode === 1) {
                if (motor_control_message === 'tilt_up') {
                    p_in = p_in + p_step;
                }
                else if (motor_control_message === 'tilt_down') {
                    p_in = p_in - p_step;
                }
                else if (motor_control_message === 'stop') {
                    motor_control_message = '';
                    run_flag = '';
                }
                else if (motor_control_message.includes('go')) {
                    p_target = (parseInt(motor_control_message.toString().replace('go', '')) * 0.0174533) + p_offset;

                    if (p_target < p_in) {
                        p_in = p_in - p_step;
                    }
                    else if (p_target > p_in) {
                        p_in = p_in + p_step;
                    }
                }
                else if (motor_control_message === 'run') {
                    target_angle = calcTargetTiltAngle(target_latitude, target_longitude, target_relative_altitude);
                    // console.log('tracker_pitch, target_angle', tracker_pitch, target_angle);
                    run_flag = 'go';

                    if (Math.abs(target_angle - tracker_pitch) > 10) {
                        p_step = 0.02;
                    }
                    else if (Math.abs(target_angle - tracker_pitch) > 5) {
                        p_step = 0.01;
                    }
                    else if (Math.abs(target_angle - tracker_pitch) > 3) {
                        p_step = 0.005;
                    }
                    else {
                        p_step = 0.001;
                    }

                    if (tracker_pitch !== target_angle) {
                        cw = target_angle - tracker_pitch;
                        if (cw < 0) {
                            cw = cw + 360;
                        }
                        ccw = 360 - cw;

                        if (cw < ccw) {
                            p_in = p_in + p_step;
                        }
                        else if (cw > ccw) {
                            p_in = p_in - p_step;
                        }
                        else {
                            p_in = p_in;
                        }
                    }
                    p_step = 0.02;
                }

                p_in = constrain(p_in, P_MIN, P_MAX);

                pack_cmd();

                no_response_count++;

                if (motor_return_msg !== '') {
                    unpack_reply();
                    no_response_count = 0;

                    motor_return_msg = '';
                    // console.log('[tilt] -> + ', p_target, p_in, p_out, v_out, t_out);
                }
            }
            else if (motormode === 2) {
                ExitMotorMode();

                if (motor_return_msg !== '') {
                    unpack_reply();
                    exit_mode_counter++;

                    motor_return_msg = '';
                    p_in = p_out + p_offset;

                    console.log('[tilt] ExitMotorMode', p_in, p_out, v_out, t_out);
                    if (exit_mode_counter > 5) {
                        motormode = 3;
                        exit_mode_counter = 0;
                    }
                }
            }

            if (no_response_count > 48) {
                console.log('[tilt] no_response_count', no_response_count);
                no_response_count = 0;
                motor_return_msg = null;
                motormode = 2;
            }

            if (local_mqtt_client !== null) {
                local_mqtt_client.publish(pub_motor_position_topic, tracker_pitch.toString(), () => {
                    // console.log('[tilt] send Motor angle to GCS value: ', p_out * 180 / Math.PI)
                });
            }
        }, 20);
    }, 1000);

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

    let msg_buf = TILT_CAN_ID + p_int_hex + v_int_hex + kp_int_hex + kd_int_hex + t_int_hex;
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
            canPort.write(Buffer.from(TILT_CAN_ID + 'FFFFFFFFFFFFFFFC', 'hex'), () => {
                // console.log(TILT_CAN_ID + 'FFFFFFFFFFFFFFFC');
            });
        }
    }
}

function ExitMotorMode() {
    if (canPort !== null) {
        if (canPort.isOpen) {
            canPort.write(Buffer.from(TILT_CAN_ID + 'FFFFFFFFFFFFFFFD', 'hex'), () => {
                // console.log(TILT_CAN_ID + 'FFFFFFFFFFFFFFFD');
            });
        }
    }
}

function Zero() {
    if (canPort !== null) {
        if (canPort.isOpen) {
            canPort.write(Buffer.from(TILT_CAN_ID + 'FFFFFFFFFFFFFFFE', 'hex'), () => {
                // console.log(TILT_CAN_ID + 'FFFFFFFFFFFFFFFE');
            });
        }
    }
}

//---------------------------------------------------
function calcTargetTiltAngle(targetLatitude, targetLongitude, targetAltitude) {
    // console.log('[tilt] myLatitude, myLongitude, myRelativeAltitude: ', myLatitude, myLongitude,
    // myRelativeAltitude);
    // console.log('[tilt] targetLatitude, targetLongitude, targetAltitude: ', targetLatitude, targetLongitude,
    // targetAltitude);

    let dist = getDistance(tracker_latitude, tracker_longitude, targetLatitude, targetLongitude)
    let x = dist;
    let y = targetAltitude - tracker_relative_altitude;

    let angle = Math.atan2(y, x);

    // console.log('x, y, angle: ', x, y, angle * 180 / Math.PI);

    return Math.round(angle * 180 / Math.PI);
    // angle = angle - (tracker_pitch * Math.PI / 180);
    // p_target = Math.round((angle + p_offset) * 50) / 50;  // 0.5단위 반올림
}

function getDistance(lat1, lon1, lat2, lon2) {
    var radLat1 = Math.PI * lat1 / 180;
    var radLat2 = Math.PI * lat2 / 180;
    var theta = lon1 - lon2;
    var radTheta = Math.PI * theta / 180;
    var dist = Math.sin(radLat1) * Math.sin(radLat2) + Math.cos(radLat1) * Math.cos(radLat2) * Math.cos(radTheta);
    if (dist > 1)
        dist = 1;

    dist = Math.acos(dist);
    dist = dist * 180 / Math.PI;
    dist = dist * 60 * 1.1515 * 1.609344 * 1000;

    return dist;
}

function calcDistance(x1, y1, x2, y2) {
    /*
        x1: Latitude of the first point
        y1: Longitude of the first point
        x2: Latitude of the second point
        y2: Longitude of the second point
    */
    const R = 6371e3; // R is earth’s radius(metres) (mean radius = 6,371km)
    const φ1 = x1 * Math.PI / 180; // φ(latitude), λ(longitude) in radians
    const φ2 = x2 * Math.PI / 180;
    const Δφ = (x2 - x1) * Math.PI / 180;
    const Δλ = (y2 - y1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    let d = R * c; // in metres

    return d
}

canPortOpening();

local_mqtt_connect('localhost');

setTimeout(() => {
    motor_control_message = 'init';
}, 3000);

