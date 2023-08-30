const mqtt = require('mqtt');
const {nanoid} = require("nanoid");
const motor_can = require('./motor_can');

const canPortNum = process.argv[2];
const CAN_ID = process.argv[3];
const TYPE = process.argv[4];

let tr_mqtt_client = null;

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

let GcsName = 'KETI_GCS';
let DroneName = 'KETI_Simul_1';

let dr_data_topic = '/Mobius/' + GcsName + '/Drone_Data/' + DroneName + '/#';

let pn_ctrl_topic = '/Mobius/' + GcsName + '/Ctrl_Data/Panel';
let pn_alt_topic = '/Mobius/' + GcsName + '/Alt_Data/Panel';

let tr_data_topic = '/Mobius/' + GcsName + '/Tr_Data/' + TYPE;

let gps_pos_topic = '/Mobius/' + GcsName + '/Pos_Data/GPS';
let gps_alt_topic = '/Mobius/' + GcsName + '/Att_Data/GPS';


let pub_motor_position_topic = '/Ant_Tracker/Motor_Pan';


//------------- local mqtt connect ------------------
function tr_mqtt_connect(host) {
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

    tr_mqtt_client = mqtt.connect(connectOptions);

    tr_mqtt_client.on('connect', function () {
        if (dr_data_topic !== '') {
            tr_mqtt_client.subscribe(dr_data_topic, () => {
                console.log('[local_mqtt] sub_target_data_topic is subscribed -> ', dr_data_topic);
            });
        }

        if (gps_alt_topic !== '') {
            tr_mqtt_client.subscribe(gps_alt_topic, () => {
                console.log('[local_mqtt] sub_gps_attitude_topic is subscribed -> ', gps_alt_topic);
            });
        }

        if (gps_pos_topic !== '') {
            tr_mqtt_client.subscribe(gps_pos_topic, () => {
                console.log('[local_mqtt] sub_gps_position_topic is subscribed -> ', gps_pos_topic);
            });
        }

        if (pn_ctrl_topic !== '') {
            tr_mqtt_client.subscribe(pn_ctrl_topic, () => {
                console.log('[local_mqtt] sub_tracker_control_topic is subscribed -> ', pn_ctrl_topic);
            });
        }
        if (pn_alt_topic !== '') {
            tr_mqtt_client.subscribe(pn_alt_topic, () => {
                console.log('[local_mqtt] sub_tracker_altitude_topic is subscribed -> ', pn_alt_topic);
            });
        }
    });

    tr_mqtt_client.on('message', function (topic, message) {
        let _dr_data_topic = dr_data_topic.replace('/#', '');
        let arr_topic = topic.split('/');
        let _topic = arr_topic.splice(0, arr_topic.length-1).join('/');

        if (topic === gps_pos_topic) { // 픽스호크로부터 받아오는 트래커 위치 좌표
            tracker_gpi = JSON.parse(message.toString());

            tracker_altitude = tracker_gpi.alt / 1000;

            console.log(tracker_altitude);

            countBPM++;
        }
        else if (topic === gps_alt_topic) {
            tracker_att = JSON.parse(message.toString());

            tracker_yaw = ((tracker_att.yaw * 180)/Math.PI);
            tracker_pitch = ((tracker_att.pitch * 180)/Math.PI);

            countBPM++;
        }
        else if (topic === pn_ctrl_topic) { // 모터 제어 메세지 수신
            tracker_control_message = message.toString();
            tracker_handler(tracker_control_message);
        }
        else if (topic === pn_alt_topic) {
            motor_altitude_message = message.toString();
            if (typeof (parseInt(motor_altitude_message)) === 'number') {
                tracker_relative_altitude = motor_altitude_message;
            }
        }
        else if (_topic === _dr_data_topic) { // 드론데이터 수신
            if (flagTracking === 'yes') {
                let arr_msg = message.toString().split(':');
                if (arr_msg[0] === 'gpi') {
                    target_gpi = JSON.parse(arr_msg[1]);

                    target_latitude = target_gpi.lat / 10000000;
                    target_longitude = target_gpi.lon / 10000000;
                    target_altitude = target_gpi.alt / 1000;
                    target_relative_altitude = target_gpi.relative_alt / 1000;

                    //console.log('target_gpi: ', JSON.stringify(target_gpi));


                    if (TYPE === 'tilt') {
                        let t_angle = calcTargetTiltAngle(target_latitude, target_longitude, target_altitude);

                        console.log('\n\n[tilt] t_angle = ', t_angle, '\n\n');

                        motor_can.setTarget(t_angle);
                    }
                    else if (TYPE === 'pan') {
                        let t_angle = calcTargetPanAngle(target_latitude, target_longitude);

                        motor_can.setTarget(t_angle);
                    }
                }
            }
        }
    });

    tr_mqtt_client.on('error', function (err) {
        console.log('[local_mqtt] error ' + err.message);
    });
}

function calcTargetPanAngle(targetLatitude, targetLongitude) {
    let target_latitude_rad = targetLatitude * Math.PI / 180;
    let target_longitude_rad = targetLongitude * Math.PI / 180;

    let tracker_latitude_rad = tracker_latitude * Math.PI / 180;
    let tracker_longitude_rad = tracker_longitude * Math.PI / 180;

    let y = Math.sin(target_longitude_rad - tracker_longitude_rad) * Math.cos(target_latitude_rad);
    let x = Math.cos(tracker_latitude_rad) * Math.sin(target_latitude_rad) - Math.sin(tracker_latitude_rad) * Math.cos(target_latitude_rad) * Math.cos(target_longitude_rad - tracker_longitude_rad);
    let angle = Math.atan2(y, x); // azimuth angle (radians)

    return Math.round(angle * 180 / Math.PI);
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

function calcTargetTiltAngle(targetLatitude, targetLongitude, targetAltitude) {
    //let x = getDistance(tracker_latitude, tracker_longitude, targetLatitude, targetLongitude);

    let cur_lat = tracker_latitude;
    let cur_lon = tracker_longitude;
    let cur_alt = tracker_altitude;

    let result1 = dfs_xy_conv('toXY', cur_lat, cur_lon);

    let tar_lat = targetLatitude;
    let tar_lon = targetLongitude;
    let tar_alt = targetAltitude;

    let result2 = dfs_xy_conv('toXY', tar_lat, tar_lon);

    let x = Math.sqrt(Math.pow(result2.x - result1.x, 2) + Math.pow(result2.y - result1.y, 2) + Math.pow((tar_alt - cur_alt), 2));

    let y = targetAltitude - tracker_altitude;

    console.log(cur_lat, cur_lon, cur_alt);
    console.log(tar_lat, tar_lon, tar_alt);
    console.log('x: ', x, '     y: ', y);

    let angle = Math.atan2(y, x);

    return Math.round(angle * 180 / Math.PI);
}

const RE = 6371.00877; // 지구 반경(km)
const GRID = 0.001; // 격자 간격(km)
const SLAT1 = 30.0; // 투영 위도1(degree)
const SLAT2 = 60.0; // 투영 위도2(degree)
const OLON = 126.0; // 기준점 경도(degree)
const OLAT = 38.0; // 기준점 위도(degree)
const XO = 43; // 기준점 X좌표(GRID)
const YO = 136; // 기1준점 Y좌표(GRID)

function dfs_xy_conv(code, v1, v2) {
    const DEGRAD = Math.PI / 180.0;
    const RADDEG = 180.0 / Math.PI;

    const re = RE / GRID;
    const slat1 = SLAT1 * DEGRAD;
    const slat2 = SLAT2 * DEGRAD;
    const olon = OLON * DEGRAD;
    const olat = OLAT * DEGRAD;

    let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
    sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
    let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
    sf = Math.pow(sf, sn) * Math.cos(slat1) / sn;
    var ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
    ro = re * sf / Math.pow(ro, sn);
    let rs = {};
    if (code === "toXY") {
        rs['lat'] = v1;
        rs['lng'] = v2;
        var ra = Math.tan(Math.PI * 0.25 + (v1) * DEGRAD * 0.5);
        ra = re * sf / Math.pow(ra, sn);
        var theta = v2 * DEGRAD - olon;
        if (theta > Math.PI) theta -= 2.0 * Math.PI;
        if (theta < -Math.PI) theta += 2.0 * Math.PI;
        theta *= sn;
        rs['x'] = Math.floor(ra * Math.sin(theta) + XO + 0.5);
        rs['y'] = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);
    }
    else {
        rs['x'] = v1;
        rs['y'] = v2;
        let xn = v1 - XO;
        let yn = ro - v2 + YO;
        ra = Math.sqrt(xn * xn + yn * yn);
        if (sn < 0.0) -ra;
        let alat = Math.pow((re * sf / ra), (1.0 / sn));
        alat = 2.0 * Math.atan(alat) - Math.PI * 0.5;

        if (Math.abs(xn) <= 0.0) {
            theta = 0.0;
        }
        else {
            if (Math.abs(yn) <= 0.0) {
                theta = Math.PI * 0.5;
                if (xn < 0.0) -theta;
            }
            else theta = Math.atan2(xn, yn);
        }
        let alon = theta / sn + olon;
        rs['lat'] = alat * RADDEG;
        rs['lng'] = alon * RADDEG;
    }
    return rs;
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

tr_mqtt_connect('localhost');

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

            console.log('[ready][PanMotorAngle] -> ', Math.round((motor_can.getAngle()+offsetCtrl) * 10) / 10);
        }
        else if(TYPE === 'tilt') {
            //console.log('[ready][TiltMotorAngle] -> ', Math.round((motor_can.getAngle()+offsetCtrl) * 10) / 10);
        }

        setTimeout(watchdogCtrl, 500);
    }
    else if(stateCtrl === 'toArrange') {
        if(flagBPM) {
            if(motor_can.getState() === 'enter') {
                motor_can.setState('toZero');

                if (TYPE === 'pan') {
                    offsetCtrl = tracker_yaw;
                } else if (TYPE === 'tilt') {
                    offsetCtrl = tracker_pitch;
                } else {
                    offsetCtrl = 0;
                }
                console.log('[arranging offseCtrl] -> ', offsetCtrl);

                stateCtrl = 'ready';
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
                motor_can.setState('toZero');

                if (TYPE === 'pan') {
                    offsetCtrl = tracker_yaw;
                } else if (TYPE === 'tilt') {
                    offsetCtrl = tracker_pitch;
                } else {
                    offsetCtrl = 0;
                }
                console.log('[arranging offseCtrl] -> ', offsetCtrl);

                setTimeout(() => {
                    ctrlAngle(0);

                    stateCtrl = 'ready';
                    setTimeout(watchdogCtrl, 1000);
                }, 1000);
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
let flagTracking = 'no';

let tracker_handler = (_msg) => {
    console.log('received message from panel', _msg);
    if(_msg === 'test') {
        if(tidTest !== null) {
            clearTimeout(tidTest);
            tidTest = null;

            motor_can.setStop();
        }
        else {
            testAction();
        }
    }
    else if(_msg === 'arrange') {
        if(tidTest !== null) {
            clearTimeout(tidTest);
            tidTest = null;
        }

        stateCtrl = 'arranging';
    }
    else if(_msg === 'tilt_up') {
        if(TYPE === 'tilt') {
            if (tidControlTracker !== null) {
                clearInterval(tidControlTracker);
                tidControlTracker = null;
            }

            tidControlTracker = setInterval(() => {
                motor_can.setDelta(1);
            }, 100);
        }
    }
    else if(_msg === 'tilt_down') {
        if(TYPE === 'tilt') {
            if (tidControlTracker !== null) {
                clearInterval(tidControlTracker);
                tidControlTracker = null;
            }

            tidControlTracker = setInterval(() => {
                motor_can.setDelta(-1);
            }, 100);
        }
    }
    else if(_msg === 'pan_up') {
        if(TYPE === 'pan') {
            if (tidControlTracker !== null) {
                clearInterval(tidControlTracker);
                tidControlTracker = null;
            }

            tidControlTracker = setInterval(() => {
                motor_can.setDelta(1);
            }, 100);
        }
    }
    else if(_msg === 'pan_down') {
        if(TYPE === 'pan') {
            if (tidControlTracker !== null) {
                clearInterval(tidControlTracker);
                tidControlTracker = null;
            }

            tidControlTracker = setInterval(() => {
                motor_can.setDelta(-1);
            }, 100);
        }
    }
    else if(_msg === 'stop') {
        if(tidControlTracker !== null) {
            clearInterval(tidControlTracker);
            tidControlTracker = null;
        }

        motor_can.setStop();
    }
    else if(_msg === 'run') {
        if(tidControlTracker !== null) {
            clearInterval(tidControlTracker);
            tidControlTracker = null;
        }

        if(flagTracking === 'no') {
            flagTracking = 'yes';
        }
        else {
            flagTracking = 'no';
        }
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


