const mqtt = require('mqtt');
const {nanoid} = require("nanoid");
const fs = require("fs");

const motor_can = require('./motor_can');

const mavlink = require('./mavlibrary/mavlink.js');

const canPortNum = process.argv[2];
const CAN_ID = process.argv[3];
const TYPE = process.argv[4];

let tr_mqtt_client = null;

let target_gpi = {};
let tracker_control_message = '';
let motor_altitude_message = '';
let tracker_gpi = '';
let tracker_att = '';
let tracker_gri = '';

let tracker_latitude = 37.4036621604629;
let tracker_longitude = 127.16176249708046;
let tracker_altitude = 0.0;
let tracker_relative_altitude = 0.0;

let tracker_fix_type = 0;
let tracker_satellites_visible = 0;

let tracker_roll = 0.0;
let tracker_pitch = 0.0;
let tracker_yaw = 0.0;

let target_latitude = '';
let target_longitude = '';
let target_altitude = '';
let target_relative_altitude = '';

let gpsFlag = false;

let drone_info = {};
try {
    drone_info = JSON.parse(fs.readFileSync('./drone_info.json', 'utf8'));
}
catch (e) {
    console.log('can not find [ ./drone_info.json ] file');

    drone_info.id = "Dione";
    drone_info.approval_gcs = "MUV";
    drone_info.host = "121.137.228.240";
    drone_info.drone = "KETI_Simul_1";
    drone_info.gcs = "KETI_GCS";
    drone_info.type = "ardupilot";
    drone_info.system_id = 1;
    drone_info.gcs_ip = "192.168.1.150";

    fs.writeFileSync('./drone_info.json', JSON.stringify(drone_info, null, 4), 'utf8');
}

let GcsName = drone_info.gcs;
let DroneName = drone_info.drone;

let dr_data_topic = '/Mobius/' + GcsName + '/Drone_Data/' + DroneName + '/#';

let pn_ctrl_topic = '/Mobius/' + GcsName + '/Ctrl_Data/' + DroneName + '/Panel';
let pn_offset_topic = '/Mobius/' + GcsName + '/Offset_Data/' + DroneName + '/Panel';
let pn_alt_topic = '/Mobius/' + GcsName + '/Alt_Data/' + DroneName + '/Panel';
let pn_gps_ctrl_topic = '/Mobius/' + GcsName + '/Gps_Ctrl_Data/' + DroneName + '/Panel';

let tr_data_topic = '/Mobius/' + GcsName + '/Tr_Data/' + DroneName + '/' + TYPE;

let gps_pos_topic = '/Mobius/' + GcsName + '/Pos_Data/GPS';
let gps_raw_topic = '/Mobius/' + GcsName + '/Gcs_Data/GPS';
let gps_alt_topic = '/Mobius/' + GcsName + '/Att_Data/GPS';


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

    tr_mqtt_client.on('connect', () => {
        console.log('tr_mqtt_client is connected to ' + host);

        if (dr_data_topic !== '') {
            tr_mqtt_client.subscribe(dr_data_topic, () => {
                console.log('[tr_mqtt_client] sub_target_data_topic is subscribed -> ', dr_data_topic);
            });
        }

        if (gps_alt_topic !== '') {
            tr_mqtt_client.subscribe(gps_alt_topic, () => {
                console.log('[tr_mqtt_client] gps_alt_topic is subscribed -> ', gps_alt_topic);
            });
        }

        if (gps_pos_topic !== '') {
            tr_mqtt_client.subscribe(gps_pos_topic, () => {
                console.log('[tr_mqtt_client] gps_pos_topic is subscribed -> ', gps_pos_topic);
            });
        }

        if (gps_raw_topic !== '') {
            tr_mqtt_client.subscribe(gps_raw_topic, () => {
                console.log('[tr_mqtt_client] gps_raw_topic is subscribed -> ', gps_raw_topic);
            });
        }

        if (pn_ctrl_topic !== '') {
            tr_mqtt_client.subscribe(pn_ctrl_topic, () => {
                console.log('[tr_mqtt_client] pn_ctrl_topic is subscribed -> ', pn_ctrl_topic);
            });
        }

        if (pn_offset_topic !== '') {
            tr_mqtt_client.subscribe(pn_offset_topic, () => {
                console.log('[tr_mqtt_client] pn_offset_topic is subscribed -> ', pn_offset_topic);
            });
        }

        if (pn_gps_ctrl_topic !== '') {
            tr_mqtt_client.subscribe(pn_gps_ctrl_topic, () => {
                console.log('[tr_mqtt_client] pn_gps_ctrl_topic is subscribed -> ', pn_gps_ctrl_topic);
            });
        }

        if (pn_alt_topic !== '') {
            tr_mqtt_client.subscribe(pn_alt_topic, () => {
                console.log('[tr_mqtt_client] pn_alt_topic is subscribed -> ', pn_alt_topic);
            });
        }
    });

    tr_mqtt_client.on('message', (topic, message) => {
        let _dr_data_topic = dr_data_topic.replace('/#', '');
        let arr_topic = topic.split('/');
        let _topic = arr_topic.splice(0, arr_topic.length - 1).join('/');

        if (topic === gps_pos_topic) { // 픽스호크로부터 받아오는 트래커 위치 좌표
            tracker_gpi = JSON.parse(message.toString());

            if (!gpsFlag) {
                if (mavlink.GPS_FIX_TYPE_2D_FIX <= tracker_fix_type && tracker_fix_type <= mavlink.GPS_FIX_TYPE_DGPS) {
                    tracker_latitude = tracker_gpi.lat / 10000000;
                    tracker_longitude = tracker_gpi.lon / 10000000;
                    tracker_altitude = tracker_gpi.alt / 1000;
                    // tracker_altitude = tracker_gpi.relative_alt / 1000;
                    tracker_relative_altitude = tracker_gpi.relative_alt / 1000;
                }
            }

            countBPM++;
        }
        else if (topic === gps_raw_topic) { // 픽스호크로부터 받아오는 GPS 상태 정보
            tracker_gri = JSON.parse(message.toString());

            tracker_fix_type = tracker_gri.fix_type;
            tracker_satellites_visible = tracker_gri.satellites_visible;

            countBPM++;
        }
        else if (topic === gps_alt_topic) {
            tracker_att = JSON.parse(message.toString());

            tracker_yaw = ((tracker_att.yaw * 180) / Math.PI);
            tracker_pitch = ((tracker_att.pitch * 180) / Math.PI);

            countBPM++;
        }
        else if (topic === pn_ctrl_topic) { // 모터 제어 메세지 수신
            tracker_control_message = message.toString();
            tracker_handler(tracker_control_message);
        }
        else if (topic === pn_offset_topic) { // 모터 제어 메세지 수신
            let offsetObj = JSON.parse(message.toString());
            p_offset = offsetObj.p_offset;
            t_offset = offsetObj.t_offset;
            console.log('[p_offset] -->', p_offset, '[t_offset] -->', t_offset);
        }
        else if (topic === pn_gps_ctrl_topic) { // 모터 제어 메세지 수신
            if (message.toString() === 'release') {
                gpsFlag = false;
            }
            else if (message.toString().includes('hold')) {
                gpsFlag = true;
                let msg_arr = message.toString().split(',');
                tracker_altitude = msg_arr[1];
            }
        }
        else if (topic === pn_alt_topic) {
            motor_altitude_message = message.toString();
            if (typeof (parseInt(motor_altitude_message)) === 'number') {
                tracker_relative_altitude = motor_altitude_message;
            }
        }
        else if (_topic === _dr_data_topic) { // 드론데이터 수신
            if (flagTracking === 'yes') {
                let arr_msg = message.toString().split(';');
                if (arr_msg[0] === 'gpi') {
                    target_gpi = JSON.parse(arr_msg[1]);

                    target_latitude = target_gpi.lat / 10000000;
                    target_longitude = target_gpi.lon / 10000000;
                    target_altitude = target_gpi.alt / 1000;
                    target_relative_altitude = target_gpi.relative_alt / 1000;

                    //console.log('target_gpi: ', JSON.stringify(target_gpi));

                    if (TYPE === 'tilt') {
                        let t_angle = calcTargetTiltAngle(target_latitude, target_longitude, target_altitude);
                        // let t_angle = calcTargetTiltAngle(target_latitude, target_longitude, target_relative_altitude);

                        // console.log('\n\n[tilt] t_angle = ', t_angle, '\n\n');

                        //motor_can.setTarget(t_angle);
                        ctrlAngle(t_angle);
                    }
                    else if (TYPE === 'pan') {
                        let t_angle = calcTargetPanAngle(target_latitude, target_longitude);

                        //motor_can.setTarget(t_angle);
                        ctrlAngle(t_angle)
                    }
                }
            }
        }
    });

    tr_mqtt_client.on('error', (err) => {
        console.log('[tr_mqtt_client] error ' + err.message);
    });
}


let tidControlTracker = null;
let flagTracking = 'no';

let tracker_handler = (_msg) => {
    console.log('received message from panel', _msg);
    if (_msg === 'arrange') {
        stateCtrl = 'arranging';
    }
    else if (_msg === 'tilt_up') {
        if (TYPE === 'tilt') {
            if (tidControlTracker) {
                clearInterval(tidControlTracker);
                tidControlTracker = null;
            }

            tidControlTracker = setInterval(() => {
                motor_can.setDelta(1);
            }, 100);
        }
    }
    else if (_msg === 'tilt_down') {
        if (TYPE === 'tilt') {
            if (tidControlTracker) {
                clearInterval(tidControlTracker);
                tidControlTracker = null;
            }

            tidControlTracker = setInterval(() => {
                motor_can.setDelta(-1);
            }, 100);
        }
    }
    else if (_msg === 'pan_up') {
        if (TYPE === 'pan') {
            if (tidControlTracker) {
                clearInterval(tidControlTracker);
                tidControlTracker = null;
            }

            tidControlTracker = setInterval(() => {
                motor_can.setDelta(1);
            }, 100);
        }
    }
    else if (_msg === 'pan_down') {
        if (TYPE === 'pan') {
            if (tidControlTracker) {
                clearInterval(tidControlTracker);
                tidControlTracker = null;
            }

            tidControlTracker = setInterval(() => {
                motor_can.setDelta(-1);
            }, 100);
        }
    }
    else if (_msg === 'stop') {
        if (tidControlTracker) {
            clearInterval(tidControlTracker);
            tidControlTracker = null;
        }

        motor_can.setStop();
    }
    else if (_msg === 'run') {
        if (flagTracking === 'no') {
            flagTracking = 'yes';
        }
        else {
            flagTracking = 'no';
        }
    }
}

function calcTargetPanAngle(targetLatitude, targetLongitude) {
    // let target_latitude_rad = targetLatitude * Math.PI / 180;
    // let target_longitude_rad = targetLongitude * Math.PI / 180;
    //
    // let tracker_latitude_rad = tracker_latitude * Math.PI / 180;
    // let tracker_longitude_rad = tracker_longitude * Math.PI / 180;
    //
    // let y = Math.sin(target_longitude_rad - tracker_longitude_rad) * Math.cos(target_latitude_rad);
    // let x = Math.cos(tracker_latitude_rad) * Math.sin(target_latitude_rad) - Math.sin(tracker_latitude_rad) * Math.cos(target_latitude_rad) * Math.cos(target_longitude_rad - tracker_longitude_rad);
    // let angle = Math.atan2(y, x); // azimuth angle (radians)

    let cur_lat = tracker_latitude;
    let cur_lon = tracker_longitude;

    let result1 = dfs_xy_conv('toXY', cur_lat, cur_lon);

    let tar_lat = targetLatitude;
    let tar_lon = targetLongitude;

    let result2 = dfs_xy_conv('toXY', tar_lat, tar_lon);

    let x = result2.x - result1.x + 0.000001;
    let y = result2.y - result1.y + 0.000001;

    // console.log(cur_lat, cur_lon);
    // console.log(tar_lat, tar_lon);
    // console.log('x: ', x, '     y: ', y);

    let angle = Math.atan2(y, x);
    angle = -Math.round(angle * 180 / Math.PI) + 90;
    return angle;
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

    // console.log(cur_lat, cur_lon, cur_alt);
    // console.log(tar_lat, tar_lon, tar_alt);
    // console.log('x: ', x, '     y: ', y);

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
    if (countBPM > 5) {
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
let diffAngle = 0;
let p_offset = 0;
let t_offset = 0;

const DEG = 0.0174533;
let ctrlAngle = (angle) => {
    if (TYPE === 'pan') {
        offsetCtrl = tracker_yaw + p_offset;
        // console.log('[tracker_yaw] -> ', tracker_yaw, '[p_offset] -> ', p_offset);
        // console.log('[offsetCtrl] -> ', offsetCtrl);
        diffAngle = (angle - offsetCtrl);
    }
    else if (TYPE === 'tilt') {
        offsetCtrl = tracker_pitch + t_offset;
        console.log('[tracker_pitch] -> ', tracker_pitch, '[t_offset] -> ', t_offset);
        console.log('[offsetCtrl] -> ', offsetCtrl);
        if (offsetCtrl <= -10) {
            diffAngle = 0;
        }
        else {
            diffAngle = (angle - offsetCtrl);
        }
    }
    else {
        offsetCtrl = 0;
        diffAngle = (angle - offsetCtrl);
    }

    console.log('[diffAngle] -> ', diffAngle, (diffAngle * DEG));

    if (Math.abs(diffAngle) > 180) {
        if (diffAngle < 0) {
            diffAngle = diffAngle + 360;
        }
        else {
            diffAngle = diffAngle - 360;
        }
    }

    motor_can.setStop();
    motor_can.setDelta(diffAngle);
}

let tr_heartbeat = {};
let count_tr_heartbeat = 0;
let watchdogCtrl = () => {
    if (stateCtrl === 'toReady') {
        if (motor_can.getState() === 'exit') {
            motor_can.setState('toEnter');
            if (motor_can.getState() === 'enter') {
                stateCtrl = 'toArrange';
                setTimeout(watchdogCtrl, 1000);
            }
            else {
                setTimeout(watchdogCtrl, 1000);
            }
        }
        else if (motor_can.getState() === 'enter') {
            stateCtrl = 'toArrange';
            setTimeout(watchdogCtrl, 1000);
        }
        else {
            setTimeout(watchdogCtrl, 1000);
        }
    }
    else if (stateCtrl === 'ready') {
        // if(TYPE === 'pan') {
        //
        //     //console.log('[ready][PanMotorAngle] -> ', Math.round((motor_can.getAngle()+offsetCtrl) * 10) / 10);
        // }
        // else if(TYPE === 'tilt') {
        //     //console.log('[ready][TiltMotorAngle] -> ', Math.round((motor_can.getAngle()+offsetCtrl) * 10) / 10);
        // }

        tr_heartbeat.type = TYPE;
        if (TYPE === 'pan') {
            tr_heartbeat.angle = tracker_yaw;
        }
        else if (TYPE === 'tilt') {
            tr_heartbeat.angle = tracker_pitch;
        }
        tr_heartbeat.flag_tracking = flagTracking;
        tr_heartbeat.state = stateCtrl;
        tr_heartbeat.lat = tracker_latitude;
        tr_heartbeat.lon = tracker_longitude;
        tr_heartbeat.alt = tracker_altitude;
        tr_heartbeat.relative_alt = tracker_relative_altitude;
        tr_heartbeat.fix_type = tracker_fix_type;
        count_tr_heartbeat++;
        if (count_tr_heartbeat >= 2) {
            count_tr_heartbeat = 0;
            if (tr_mqtt_client) {
                tr_mqtt_client.publish(tr_data_topic, JSON.stringify(tr_heartbeat), () => {
                    console.log(tr_data_topic, JSON.stringify(tr_heartbeat));
                });
            }
        }

        setTimeout(watchdogCtrl, 500);
    }
    else if (stateCtrl === 'toArrange') {
        if (flagBPM) {
            if (motor_can.getState() === 'enter') {
                motor_can.setState('toZero');

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
    else if (stateCtrl === 'arranging') {
        if (flagBPM) {
            if (motor_can.getState() === 'enter') {
                // motor_can.setState('toZero');
                //
                // if (TYPE === 'pan') {
                //     offsetCtrl = tracker_yaw;
                // } else if (TYPE === 'tilt') {
                //     offsetCtrl = tracker_pitch;
                // } else {
                //     offsetCtrl = 0;
                // }
                // console.log('[arranging offseCtrl] -> ', offsetCtrl);

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
