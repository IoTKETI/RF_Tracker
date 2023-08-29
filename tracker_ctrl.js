const mqtt = require('mqtt');
const {nanoid} = require("nanoid");
const motor_can = require('./motor_can');

let local_mqtt_client = null;

let target_gpi = {};
let tracker_control_message = '';
let motor_altitude_message = '';
let tracker_gpi = '';
let tracker_att = '';

let tracker_latitude = 37.4036621604629;
let tracker_longitude = 127.16176249708046;
let tracker_altitude = 0.0;
let tracker_relative_altitude = 0.0;

let tracker_roll = 0.0;
let tracker_pitch = 0.0;
let tracker_yaw = 0.0;

let target_latitude = '';
let target_longitude = '';
let target_altitude = '';
let target_relative_altitude = '';

let sub_target_data_topic = '/Target/Tracker/gpi';

let sub_tracker_altitude_topic = '/Panel/Tracker/altitude';
let sub_tracker_control_topic = '/Panel/Tracker/control';
let pub_tracker_data_topic = '/Tracker/Panel/data'

let sub_gps_attitude_topic = '/GPS/Tracker/attitude';
let sub_gps_position_topic = '/GPS/Tracker/position';


let pub_motor_position_topic = '/Ant_Tracker/Motor_Pan';


//------------- local mqtt connect ------------------
function local_mqtt_connect(host) {
    let connectOptions = {
        host: host,
        port: 1883,
        protocol: "mqtt",
        keepalive: 10,
        clientId: 'local_motor_can_' + nanoid(15),
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
        if (sub_target_data_topic !== '') {
            local_mqtt_client.subscribe(sub_target_data_topic, () => {
                console.log('[local_mqtt] sub_target_data_topic is subscribed -> ', sub_target_data_topic);
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

        if (sub_tracker_control_topic !== '') {
            local_mqtt_client.subscribe(sub_tracker_control_topic, () => {
                console.log('[local_mqtt] sub_tracker_control_topic is subscribed -> ', sub_tracker_control_topic);
            });
        }
        if (sub_tracker_altitude_topic !== '') {
            local_mqtt_client.subscribe(sub_tracker_altitude_topic, () => {
                console.log('[local_mqtt] sub_tracker_altitude_topic is subscribed -> ', sub_tracker_altitude_topic);
            });
        }
    });

    local_mqtt_client.on('message', function (topic, message) {
        if (topic === sub_gps_position_topic) { // 픽스호크로부터 받아오는 트래커 위치 좌표
            tracker_gpi = JSON.parse(message.toString());

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
            //target_angle = calctargetAngleAngle(target_latitude, target_longitude);
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

            tracker_yaw = ((tracker_att.yaw * 180)/Math.PI);
            tracker_pitch = ((tracker_att.pitch * 180)/Math.PI);

            countBPM++;
        }
        else if (topic === sub_tracker_control_topic) { // 모터 제어 메세지 수신
            tracker_control_message = message.toString();
            tracker_handler(tracker_control_message);
        }
        else if (topic === sub_tracker_altitude_topic) {
            motor_altitude_message = message.toString();
            if (typeof (parseInt(motor_altitude_message)) === 'number') {
                tracker_relative_altitude = motor_altitude_message;
            }
        }
        else if (topic === sub_target_data_topic) { // 드론데이터 수신
            target_gpi = JSON.parse(message.toString());

            target_latitude = target_gpi.lat / 10000000;
            target_longitude = target_gpi.lon / 10000000;
            target_altitude = target_gpi.alt / 1000;
            target_relative_altitude = target_gpi.relative_alt / 1000;
            //console.log('target_gpi: ', JSON.stringify(target_gpi));
        }
    });

    local_mqtt_client.on('error', function (err) {
        console.log('[local_mqtt] error ' + err.message);
    });
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

function calctargetAngleAngle(targetLatitude, targetLongitude) {
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
    //     tracker_control_message = 'run';
    // }
    // else if (run_flag === 'go') {
    //     if (parseInt(Math.abs(cur_angle)) === 360) {
    //         tracker_control_message = 'zero';
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
}, 3000)

local_mqtt_connect('localhost');

const canPortNum = process.argv[2];
const CAN_ID = process.argv[3];
const TYPE = process.argv[4];

motor_can.canPortOpening(canPortNum, CAN_ID);
motor_can.loop();

let offsetCtrl = 0;
let targetAngle = 0;
const DEG = 0.0174533;
let ctrlAngle = (angle) => {
    targetAngle = (angle - offsetCtrl);

    console.log('[targetAngle] -> ', targetAngle, (targetAngle * DEG));

    motor_can.setTarget(targetAngle);
}

let watchdogCtrl = () => {
    if(stateCtrl === 'toReady') {
        if(motor_can.getState() === 'exit') {
            motor_can.setState('toEnter');
            if (motor_can.getState() === 'enter') {
                stateCtrl = 'toArrange';
                setTimeout(watchdogCtrl, 1000);
            }
            else {
                setTimeout(watchdogCtrl, 1000);
            }
        }
        else if(motor_can.getState() === 'enter') {
            stateCtrl = 'toArrange';
            setTimeout(watchdogCtrl, 1000);
        }
        else {
            setTimeout(watchdogCtrl, 1000);
        }
    }
    else if(stateCtrl === 'ready') {
        if(TYPE === 'pan') {
            console.log('[PanMotorAngle] -> ', motor_can.getAngle()+offsetCtrl);
        }
        else if(TYPE === 'tilt') {
            // console.log('[TiltMotorAngle] -> ', motor_can.getAngle()+offsetCtrl);
        }

        setTimeout(watchdogCtrl, 500);
    }
    else if(stateCtrl === 'toArrange') {
        if(flagBPM) {
            if(motor_can.getState() === 'enter') {
                motor_can.setState('toZero');

                stateCtrl = 'arranging';
                setTimeout(watchdogCtrl, 100);
            }
            else {
                console.log('motor is not state of enter');
                setTimeout(watchdogCtrl, 1000);
            }
        }
        else {
            console.log('unknown My Position');
            setTimeout(watchdogCtrl, 1000);
        }
    }
    else if(stateCtrl === 'arranging') {
        if(flagBPM) {
            if(motor_can.getState() === 'enter') {
                if (TYPE === 'pan') {
                   offsetCtrl = tracker_yaw;
                } else if (TYPE === 'tilt') {
                   offsetCtrl = tracker_pitch;
                } else {
                   offsetCtrl = 0;
                }
                console.log('[arranging offseCtrl] -> ', offsetCtrl);

                ctrlAngle(0);

                stateCtrl = 'ready';
                setTimeout(watchdogCtrl, 1000);
            }
            else {
                console.log('motor is not state of enter');
                setTimeout(watchdogCtrl, 1000);
            }
        }
        else {
            console.log('unknown My Position');
            setTimeout(watchdogCtrl, 1000);
        }
    }
}


let stateCtrl = 'toReady'
setTimeout(watchdogCtrl, 1000);

let tidControlTracker = null;

let tracker_handler = (_msg) => {
    if(_msg === 'test') {
        if(tidTest !== null) {
            clearTimeout(tidTest);
            tidTest = null;
        }
        else {
            testAction();
        }
    }
    else if(_msg === 'init') {
        if(tidTest !== null) {
            clearTimeout(tidTest);
            tidTest = null;
        }

        stateCtrl = 'toReady';
    }
    else if(_msg === 'tilt_up') {
        if(tidControlTracker !== null) {
            clearInterval(tidControlTracker);
            tidControlTracker = null;
        }

        tidControlTracker = setInterval(() => {
            motor_can.setDelta(1);
        }, 100);
    }
    else if(_msg === 'stop') {
        if(tidControlTracker !== null) {
            clearInterval(tidControlTracker);
            tidControlTracker = null;
        }

        motor_can.setStop();
    }
}

let tidTest = null;
let t_angle = 0;
function testAction() {
    if(stateCtrl === 'ready') {

        if(TYPE === 'pan') {
            t_angle = parseInt(Math.random() * 360);
        }
        else if(TYPE === 'tilt') {
            t_angle = parseInt(Math.random() * 90);
        }

        ctrlAngle(t_angle);

        let period = (1 + parseInt(Math.random() * 3)) * 1000;
        //let period = (10) * 1000;
        tidTest = setTimeout(testAction, period);
    }
    else {
        tidTest = setTimeout(testAction, 1000);
    }
}


