const mqtt = require('mqtt');
const {nanoid} = require("nanoid");
const fs = require("fs");

const motor_bgc = require('./motor_bgc');

const mavlink = require('./mavlibrary/mavlink.js');

let target_gpi = {};
let tracker_control_message = '';
let motor_altitude_message = '';
let tracker_gpi = '';
let tracker_att = '';
let tracker_gri = '';

let tracker_latitude = 37.4036621604629;
let tracker_longitude = 127.16176249708046;
let OFFSET_ALT = 0.5;
let tracker_altitude = OFFSET_ALT;
let origin_tracker_altitude = OFFSET_ALT;

let tracker_fix_type = 0;
let tracker_satellites_visible = 0;

let tracker_roll = 0.0;
let tracker_pitch = 0.0;
let tracker_yaw = 0.0;

let target_latitude = '';
let target_longitude = '';
let target_altitude = 0.0;

let gpsUpdateFlag = true;

let g_pan_t_angle = 0;
let g_tilt_t_angle = 0;

let drone_info = {};
try {
    drone_info = JSON.parse(fs.readFileSync('./drone_info.json', 'utf8'));
}
catch (e) {
    console.log('can not find [ ./drone_info.json ] file');

    drone_info.id = "Dione";
    drone_info.approval_gcs = "MUV";
    drone_info.host = "gcs.iotocean.org";
    drone_info.drone = "KETI_Drone";
    drone_info.gcs = "KETI_GCS";
    drone_info.type = "ardupilot";
    drone_info.system_id = 250;

    fs.writeFileSync('./drone_info.json', JSON.stringify(drone_info, null, 4), 'utf8');
}

let GcsName = drone_info.gcs;
let DroneName = drone_info.drone;

let tr_mqtt_client = null;
let dr_data_topic = '/Mobius/' + GcsName + '/Drone_Data/' + DroneName + '/+/tr';

let pn_ctrl_topic = '/Mobius/' + GcsName + '/Ctrl_Data/' + DroneName + '/Panel';
let pn_offset_topic = '/Mobius/' + GcsName + '/Offset_Data/' + DroneName + '/Panel';
let pn_alt_topic = '/Mobius/' + GcsName + '/Alt_Data/' + DroneName + '/Panel';
let pn_speed_topic = '/Mobius/' + GcsName + '/Speed_Data/' + DroneName + '/Panel';
let pn_gps_ctrl_topic = '/Mobius/' + GcsName + '/Gps_Ctrl_Data/' + DroneName + '/Panel';

let gps_pos_topic = '/Mobius/' + GcsName + '/Pos_Data/GPS';
let gps_raw_topic = '/Mobius/' + GcsName + '/Gps_Data/GPS';
let gps_att_topic = '/Mobius/' + GcsName + '/Att_Data/GPS';
let gps_type_topic = '/Mobius/' + GcsName + '/Type_Data/GPS';

let tr_data_topic = '/Mobius/' + GcsName + '/Tr_Data/' + DroneName + '/pantilt';
let tr_cmd_data_topic = '/Mobius/' + GcsName + '/TrCmd_Data/' + DroneName + '/Panel';

let antType = 'T0';

//------------- local mqtt connect ------------------
function tr_mqtt_connect(host) {
    let connectOptions = {
        host: host,
        port: 1883,
        protocol: "mqtt",
        keepalive: 10,
        clientId: 'tr_ctrl_bgc_local_' + nanoid(15),
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

        if (gps_att_topic !== '') {
            tr_mqtt_client.subscribe(gps_att_topic, () => {
                console.log('[tr_mqtt_client] gps_att_topic is subscribed -> ', gps_att_topic);
            });
        }

        if (pn_speed_topic !== '') {
            tr_mqtt_client.subscribe(pn_speed_topic, () => {
                console.log('[pn_speed_topic] pn_speed_topic is subscribed -> ', pn_speed_topic);
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

        if (gps_type_topic !== '') {
            tr_mqtt_client.subscribe(gps_type_topic, () => {
                console.log('[tr_mqtt_client] gps_type_topic is subscribed -> ', gps_type_topic);
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
        let arr_topic = topic.split('/');

        if (topic === gps_pos_topic) { // 픽스호크로부터 받아오는 트래커 위치 좌표
            tracker_gpi = JSON.parse(message.toString());

            if (gpsUpdateFlag) {
                if (mavlink.GPS_FIX_TYPE_2D_FIX <= tracker_fix_type && tracker_fix_type <= mavlink.GPS_FIX_TYPE_RTK_FIXED) {
                    tracker_latitude = tracker_gpi.lat / 10000000;
                    tracker_longitude = tracker_gpi.lon / 10000000;

                    // tracker_altitude = tracker_gpi.alt / 1000;
                    origin_tracker_altitude = tracker_gpi.relative_alt / 1000;
                    tracker_altitude = origin_tracker_altitude + OFFSET_ALT;
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
        else if (topic === gps_att_topic) {
            tracker_att = JSON.parse(message.toString());

            tracker_yaw = ((tracker_att.yaw * 180) / Math.PI);
            tracker_pitch = ((tracker_att.pitch * 180) / Math.PI);

            countBPM++;
        }
        else if (topic === pn_speed_topic) {
            SPEED = message.toString();

            tr_heartbeat.speed = SPEED;
            fs.writeFileSync('./tr_heartbeat.json', JSON.stringify(tr_heartbeat, null, 4), 'utf8');
        }
        else if (topic === gps_type_topic) {
            antType = message.toString();
        }
        else if (topic === pn_ctrl_topic) { // 모터 제어 메세지 수신
            tracker_control_message = message.toString();
            tracker_handler(tracker_control_message);
        }
        else if (topic === pn_gps_ctrl_topic) { // GPS 좌표 고정 여부 메세지 수신
            if (message.toString() === 'release') {
                gpsUpdateFlag = true;
            }
            else if (message.toString() === 'hold') {
                gpsUpdateFlag = false;
            }

            tr_heartbeat.gps_update = gpsUpdateFlag;
            fs.writeFileSync('./tr_heartbeat.json', JSON.stringify(tr_heartbeat, null, 4), 'utf8');
        }
        else if (topic === pn_alt_topic) {
            motor_altitude_message = parseFloat(message.toString());
            if (typeof (motor_altitude_message) === 'number') {
                OFFSET_ALT = motor_altitude_message;
                tracker_altitude = origin_tracker_altitude + OFFSET_ALT;
            }

            tr_heartbeat.offset_alt = OFFSET_ALT;

            fs.writeFileSync('./tr_heartbeat.json', JSON.stringify(tr_heartbeat, null, 4), 'utf8');
        }
        else if (arr_topic[3] === 'Drone_Data' && arr_topic[6] === 'tr') { // 드론데이터 수신
            if (flagTracking === 'yes') {
                let arr_msg = message.toString().split(';');
                if (arr_msg[0] === 'gpi') {
                    target_gpi = JSON.parse(arr_msg[1]);

                    target_latitude = target_gpi.lat / 10000000;
                    target_longitude = target_gpi.lon / 10000000;
                    target_altitude = target_gpi.alt / 1000;
                    target_altitude = target_gpi.relative_alt / 1000;

                    //console.log('target_gpi: ', JSON.stringify(target_gpi));

                    g_pan_t_angle = calcTargetPanAngle(target_latitude, target_longitude);
                    g_tilt_t_angle = calcTargetTiltAngle(target_latitude, target_longitude, target_altitude);
                }
            }
        }
    });

    tr_mqtt_client.on('error', (err) => {
        console.log('[tr_mqtt_client] error ' + err.message);
    });
}

let flagTracking = 'no';
const STEP = 152;
let tracker_handler = (_msg) => {
    console.log('received message from panel', _msg);
    if (_msg === 'arrange') {
        if (stateCtrl === 'arranging') {
            stateCtrl = 'ready';
            flagTracking = 'no';
            motor_bgc.setStop();

            g_pan_t_angle = tracker_yaw;
            g_tilt_t_angle = tracker_pitch;
        }
        else {
            g_pan_t_angle = 0;
            g_tilt_t_angle = 0;

            stateCtrl = 'arranging';
            flagTracking = 'no';
        }
    }
    else if (_msg === 'tilt_up') {
        stateCtrl = 'manual';
        motor_bgc.setDelta(0, STEP);
    }
    else if (_msg === 'tilt_down') {
        stateCtrl = 'manual';
        motor_bgc.setDelta(0, -STEP);
    }
    else if (_msg === 'pan_up') {
        stateCtrl = 'manual';
        motor_bgc.setDelta(STEP, 0);
    }
    else if (_msg === 'pan_down') {
        stateCtrl = 'manual';
        motor_bgc.setDelta(-STEP, 0);
    }
    else if (_msg === 'stop') {
        g_pan_t_angle = tracker_yaw;
        g_tilt_t_angle = tracker_pitch;
        stateCtrl = 'ready';
        motor_bgc.setStop();
    }
    else if (_msg === 'run') {
        if (stateCtrl === 'run') {
            stateCtrl = 'ready';
            flagTracking = 'no';
            motor_bgc.setStop();

            g_pan_t_angle = tracker_yaw;
            g_tilt_t_angle = tracker_pitch;
        }
        else {
            if (tr_mqtt_client) {
                tr_mqtt_client.publish(tr_cmd_data_topic, 'run');
            }
            stateCtrl = 'run';
            flagTracking = 'yes';
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

setTimeout(tr_mqtt_connect, 3000, '127.0.0.1');

let pan_offset_ctrl = 0;
let tilt_offset_ctrl = 0;
let pan_diff_angle = 0;
let tilt_diff_angle = 0;
let pan_offset = 0;
let tilt_offset = 0;

const DEG = 0.0174533;

let SPEED = 8.88 * 4;
let ctrlAngle = (pan_t_angle, tilt_t_angle) => {

    pan_offset_ctrl = tracker_yaw + pan_offset;
    pan_diff_angle = (pan_t_angle - pan_offset_ctrl);

    tilt_offset_ctrl = tracker_pitch + tilt_offset;
    tilt_diff_angle = (tilt_t_angle - tilt_offset_ctrl);

    console.log('[diff_angle] -> ', pan_diff_angle, tilt_diff_angle);

    if (Math.abs(pan_diff_angle) > 180) {
        if (pan_diff_angle < 0) {
            pan_diff_angle = pan_diff_angle + 360;
        }
        else {
            pan_diff_angle = pan_diff_angle - 360;
        }
    }

    if (Math.abs(tilt_diff_angle) > 180) {
        if (tilt_diff_angle < 0) {
            tilt_diff_angle = tilt_diff_angle + 360;
        }
        else {
            tilt_diff_angle = tilt_diff_angle - 360;
        }
    }

    // motor_bgc.setStop();
    motor_bgc.setDelta((pan_diff_angle * SPEED), (tilt_diff_angle * SPEED));
}

let tr_heartbeat = {};
try {
    tr_heartbeat = JSON.parse(fs.readFileSync('./tr_heartbeat.json', 'utf8'));
    console.log('tr_heartbeat.json', tr_heartbeat);
    SPEED = tr_heartbeat.speed;
    OFFSET_ALT = tr_heartbeat.offset_alt;
}
catch (e) {
    console.log('can not find [ ./tr_heartbeat.json ] file');

    tr_heartbeat.pan_angle = 0;
    tr_heartbeat.tilt_angle = 0;
    tr_heartbeat.flag_tracking = 'no';
    tr_heartbeat.state = 'ready';
    tr_heartbeat.lat = 37.4036621604629;
    tr_heartbeat.lon = 127.16176249708046;
    tr_heartbeat.alt = 0;
    tr_heartbeat.fix_type = 0;
    tr_heartbeat.pan_offset = 0;
    tr_heartbeat.tilt_offset = 0;
    tr_heartbeat.gps_update = true;
    tr_heartbeat.ant_type = "T0";
    tr_heartbeat.speed = SPEED;
    tr_heartbeat.offset_alt = OFFSET_ALT;

    fs.writeFileSync('./tr_heartbeat.json', JSON.stringify(tr_heartbeat, null, 4), 'utf8');
}

let count_tr_heartbeat = 0;
let watchdogCtrl = () => {
    if (stateCtrl === 'ready') {
        ctrlAngle(g_pan_t_angle, g_tilt_t_angle);
    }
    else if ((stateCtrl === 'arranging') || (stateCtrl === 'run')) {
        if (flagBPM) {
            ctrlAngle(g_pan_t_angle, g_tilt_t_angle);
        }
        else {
            console.log('unknown My Position');
            motor_bgc.setStop();
        }
    }

    count_tr_heartbeat++;
    if (count_tr_heartbeat > 10) {
        count_tr_heartbeat = 0;
        tr_heartbeat.pan_angle = tracker_yaw;
        tr_heartbeat.tilt_angle = tracker_pitch;
        tr_heartbeat.flag_tracking = flagTracking;
        tr_heartbeat.state = stateCtrl;
        tr_heartbeat.lat = tracker_latitude;
        tr_heartbeat.lon = tracker_longitude;
        tr_heartbeat.alt = tracker_altitude;
        tr_heartbeat.fix_type = tracker_fix_type;
        tr_heartbeat.pan_offset = pan_offset;
        tr_heartbeat.tilt_offset = tilt_offset;
        tr_heartbeat.gps_update = gpsUpdateFlag;
        tr_heartbeat.ant_type = antType;
        tr_heartbeat.speed = SPEED;
        tr_heartbeat.offset_alt = OFFSET_ALT;

        if (tr_mqtt_client) {
            tr_mqtt_client.publish(tr_data_topic, JSON.stringify(tr_heartbeat), () => {
                //console.log(tr_data_topic, JSON.stringify(tr_heartbeat));
            });
        }
    }
}

let stateCtrl = 'ready';

setTimeout(() => {
    tilt_offset = tr_heartbeat.tilt_offset;
    pan_offset = tr_heartbeat.pan_offset;
    gpsUpdateFlag = tr_heartbeat.gps_update;

    console.log(pan_offset, tilt_offset);

    g_pan_t_angle = tracker_yaw;
    g_tilt_t_angle = tracker_pitch;
    setInterval(watchdogCtrl, 100);
}, 6000);
