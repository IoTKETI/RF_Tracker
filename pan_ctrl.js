const mqtt = require('mqtt');
const {nanoid} = require("nanoid");
const pan_motor = require('./motor_can');


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


let local_mqtt_client = null;

let target_gpi = {};
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

let target_latitude = '';
let target_longitude = '';
let target_altitude = '';
let target_relative_altitude = '';

let sub_drone_data_topic = '/Ant_Tracker/target_drone/gpi';
let sub_motor_control_topic = '/Ant_Tracker/Control';
let sub_motor_altitude_topic = '/Ant_Tracker/Altitude';

let sub_gps_attitude_topic = '/GPS/attitude';
let sub_gps_position_topic = '/GPS/position';


let pub_motor_position_topic = '/Ant_Tracker/Motor_Pan';


//------------- local mqtt connect ------------------
function local_mqtt_connect(host) {
    let connectOptions = {
        host: host,
        port: 1883,
        protocol: "mqtt",
        keepalive: 10,
        clientId: 'local_pan_motor_' + nanoid(15),
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

        if (sub_gps_attitude_topic !== '') {
            local_mqtt_client.subscribe(sub_gps_attitude_topic, () => {
                console.log('[local_mqtt] sub_gps_attitude_topic is subscribed -> ', sub_gps_attitude_topic);
            });
        }
           
        if (sub_gps_position_topic !== '') {
            local_mqtt_client.subscribe(sub_gps_position_topic, () => {
                console.log('[local_mqtt] sub_gps_position_topic is subscribed -> ', sub_gps_position_topic);
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
    });

    local_mqtt_client.on('message', function (topic, message) {
        if (topic === sub_motor_control_topic) { // 모터 제어 메세지 수신
            motor_control_message = message.toString();
        }
        else if (topic === sub_motor_altitude_topic) {
            motor_altitude_message = message.toString();
            if (typeof (parseInt(motor_altitude_message)) === 'number') {
                tracker_relative_altitude = motor_altitude_message;
            }
        }
        else if (topic === sub_drone_data_topic) { // 드론데이터 수신
            target_gpi = JSON.parse(message.toString());

            target_latitude = target_gpi.lat / 10000000;
            target_longitude = target_gpi.lon / 10000000;
            target_altitude = target_gpi.alt / 1000;
            target_relative_altitude = target_gpi.relative_alt / 1000;
            //console.log('target_gpi: ', JSON.stringify(target_gpi));
        }
        else if (topic === sub_gps_position_topic) { // 픽스호크로부터 받아오는 트래커 위치 좌표
            tracker_gpi = JSON.parse(message.toString());

            //console.log('[position] -> ', tracker_gpi.lat, tracker_gpi.lon, tracker_gpi.relative_alt, tracker_gpi.alt, tracker_gpi.hdg);
            
            countBPM++;

            ////if (tracker_gpi.lat > 0 && tracker_gpi.lon > 0) {
                ////tracker_latitude = tracker_gpi.lat / 10000000;
                ////tracker_longitude = tracker_gpi.lon / 10000000;
            ////}
            ////tracker_altitude = tracker_gpi.alt / 1000;
            ////tracker_relative_altitude = tracker_gpi.relative_alt / 1000;
            //tracker_heading = tracker_gpi.hdg;

            //let tracker_heading_int = Math.round(tracker_heading);
            //if (tracker_heading_int >= 180) {
                //tracker_heading = tracker_heading_int - 360;
            //}
            //else {
                //tracker_heading = tracker_heading_int;
            //}
            //console.log('tracker_gpi: ', JSON.stringify(tracker_gpi), '\ntracker_heading_int -', tracker_heading_int, '\ntracker_heading -', tracker_heading);

            //if (run_flag === 'go') {
                //target_angle = calcTargetPanAngle(target_latitude, target_longitude);
                ////console.log('tracker_heading, target_angle', tracker_heading, target_angle);

                //if (Math.abs(target_angle - tracker_heading) > 15) {
                    //p_step = 0.015;
                //}
                //else if (Math.abs(target_angle - tracker_heading) > 10) {
                    //p_step = 0.008;
                //}
                //else if (Math.abs(target_angle - tracker_heading) > 5) {
                    //p_step = 0.004;
                //}
                //else {
                    //p_step = 0.001;
                //}

                //if (tracker_heading !== target_angle) {
                    //cw = target_angle - tracker_heading;
                    //if (cw < 0) {
                        //cw = cw + 360;
                    //}
                    //ccw = 360 - cw;

                    //if (cw < ccw) {
                        //p_in = p_in + p_step;
                    //}
                    //else if (cw > ccw) {
                        //p_in = p_in - p_step;
                    //}
                    //else {
                        //p_in = p_in;
                    //}
                //}
                //p_step = 0.02;
            //}
        }
        else if (topic === sub_gps_attitude_topic) {
            tracker_att = JSON.parse(message.toString());

            //console.log('[attitude] -> ', tracker_att.roll, tracker_att.pitch, tracker_att.yaw);
            
            countBPM++;
        }
    });

    local_mqtt_client.on('error', function (err) {
        console.log('[local_mqtt] error ' + err.message);
    });
}

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
                    motormode = 1;
                    // initAction();
                    motor_control_message = 'zero';
                    EnterMotorMode();
                }
                else {
                    // initAction();
                    motor_control_message = 'zero';
                }
            }

            if (motormode === 1) {
                if (motor_control_message === 'pan_up') {
                    p_in = p_in + p_step;
                }
                else if (motor_control_message === 'pan_down') {
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
                    target_angle = calcTargetPanAngle(target_latitude, target_longitude);
                    //console.log('tracker_heading, target_angle', tracker_heading, target_angle);
                    run_flag = 'go';

                    if (Math.abs(target_angle - tracker_heading) > 15) {
                        p_step = 0.015;
                    }
                    else if (Math.abs(target_angle - tracker_heading) > 10) {
                        p_step = 0.008;
                    }
                    else if (Math.abs(target_angle - tracker_heading) > 5) {
                        p_step = 0.004;
                    }
                    else {
                        p_step = 0.001;
                    }

                    if (tracker_heading !== target_angle) {
                        cw = target_angle - tracker_heading;
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

                    motor_control_message = '';
                }

                p_in = constrain(p_in, P_MIN, P_MAX);

                pack_cmd();

                no_response_count++;

                if (motor_return_msg !== '') {
                    unpack_reply();
                    no_response_count = 0;

                    motor_return_msg = '';
                    // console.log('[pan] -> + ', p_target, p_in, p_out, v_out, t_out);
                }
            }
            else if (motormode === 2) {
                ExitMotorMode();

                if (motor_return_msg !== '') {
                    unpack_reply();
                    exit_mode_counter++;

                    motor_return_msg = '';
                    p_in = p_out + p_offset;

                    console.log('[pan] ExitMotorMode', p_in, p_out, v_out, t_out);
                    if (exit_mode_counter > 5) {
                        motormode = 3;
                        exit_mode_counter = 0;
                    }
                }
            }

            if (no_response_count > 48) {
                console.log('[pan] no_response_count', no_response_count);
                no_response_count = 0;
                motor_return_msg = null;
                motormode = 2;
            }

            if (local_mqtt_client !== null) {
                local_mqtt_client.publish(pub_motor_position_topic, tracker_heading.toString(), () => {
                    // console.log('[pan] send Motor angle to GCS value: ', p_out * 180 / Math.PI)
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

let countBPM = 0;
let flagBPM = 0;
setInterval(() => {
    if(countBPM > 5) {
        countBPM = 0;
        flagBPM = 1;
    }
    else {
        flagBPM = 0;
    }
}, 5000)

let initAction = () => {
    if(pan_motor.getState() === 'zero') {
        setTimeout(() => {
            pan_motor.setTarget(-20);
            setTimeout(() => {
                pan_motor.setTarget(20);
                setTimeout(() => {
                    pan_motor.setDelta(-20);
                    setTimeout(() => {
                        pan_motor.setTarget(0);
                    }, 2500);
                }, 5000);
            }, 2500);
        },1000);
    }
    else {
        setTimeout(initAction, 500);
    }
}

let initMotor = () => {
    if(pan_motor.getState() === 'exit') {
        setTimeout(() => {
            pan_motor.setState('toEnter');
            setTimeout(() => {
                pan_motor.setState('toZero');
            },3000);
        },3000);
    }
    else {
        setTimeout(initMotor, 500);
    }
}

let canPortNum = '/dev/ttyAMA1';
pan_motor.canPortOpening(canPortNum);
pan_motor.loop();


let offsetPan = 0;
let anglePan = 0;
let targetPan = 0;
let statePan = 'toMotor'
function watchdogPanCtrl() {
    if(statePan === 'toMotor') {
        if(pan_motor.getState() === 'exit') {
            setTimeout(() => {
                pan_motor.setState('toEnter');
                setTimeout(() => {
                    pan_motor.setState('toZero');
                    
                    statePan = 'motor';
                    setTimeout(watchdogPanCtrl, 0);
                }, 3000);
            }, 3000);
        }
        else {
            setTimeout(watchdogPanCtrl, 500);
        }
    }
    else if(statePan === 'motor') {
        setTimeout(watchdogPanCtrl, 300);
    }
    else if(statePan === 'toReady') {
        if(pan_motor.getState() === 'zero') {
            if(flagBPM) {
                offsetPan = parseInt(tracker_gpi.hdg/100);
                console.log('[offsePan] -> ', offsetPan);
                setTimeout(() => {
                    anglePan = 0;
                    targetPan = (anglePan - offsetPan) > 180 ?  (anglePan - offsetPan) - 360 : (anglePan - offsetPan);
                    
                    console.log('[targetPan] -> ', targetPan);

                    pan_motor.setTarget(targetPan);
                    //setTimeout(() => {
                        //valuePan = -79;
                        //targetPan = valuePan - offsetPan;
                        //pan_motor.setTarget(targetPan);
                        //setTimeout(() => {
                            //pan_motor.setDelta(-20);
                            //setTimeout(() => {
                                //valuePan = -99;
                                //targetPan = valuePan - offsetPan;
                                //pan_motor.setTarget(targetPan);
                            //}, 10000);
                        //}, 10000);
                    //}, 10000);
                },1000);
            }
            else {
                setTimeout(watchdogPanCtrl, 300);
            }
        }
        else {
            setTimeout(watchdogPanCtrl, 300);
        }
    }
    else if(statePan === 'ready') {
        setTimeout(watchdogPanCtrl, 300);
    } 
}


//initMotor();
//initAction();

//function enterMotorMode(callback) {
    //if(pan_motor.getState() === 'exit') {
        //setTimeout(() => {
            //pan_motor.setState('toEnter');
            //setTimeout(() => {
                //pan_motor.setState('toZero');
                //callback();
            //}, 3000, callback);
        //}, 3000, callback);
    //}
    //else {
        //setTimeout(enterMotorMode, 500, callback);
    //}
//}

//setInterval(() => {
    //pan_motor.setState('toExit');
    
    //enterMotorMode(() => {
        //console.log('zero');
    //});
    
    //initAction();
//}, 60000);


local_mqtt_connect('localhost');

watchdogPanCtrl();

setTimeout(() => {
    statePan = 'toReady';
}, 15000);

