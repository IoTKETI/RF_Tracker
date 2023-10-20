const {SerialPort} = require('serialport');
const mqtt = require('mqtt');
const {nanoid} = require('nanoid');
const fs = require("fs");

const mavlink = require('./mavlibrary/mavlink.js');

let mavPortNum = '/dev/ttyAMA0';
let mavBaudrate = '115200';
let mavPort = null;

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

let global_position_int_msg = {};
let gps_raw_int_msg = {};
let attitude_msg = {};

let position_refresh_flag = 0;
let attitude_refresh_flag = 0;

global_position_int_msg.lat = 37.4036621604629;
global_position_int_msg.lon = 127.16176249708046;
global_position_int_msg.alt = 0.0;
global_position_int_msg.relative_alt = 0.0;
global_position_int_msg.hdg = 0.0;

attitude_msg.yaw = 0.0;

let GcsName = drone_info.gcs;
let DroneName = drone_info.drone;

let tr_mqtt_client = null;

let gps_pos_topic = '/Mobius/' + GcsName + '/Pos_Data/GPS';
let gps_alt_topic = '/Mobius/' + GcsName + '/Att_Data/GPS';
let gps_raw_topic = '/Mobius/' + GcsName + '/Gcs_Data/GPS';
let gps_type_topic = '/Mobius/' + GcsName + '/Type_Data/GPS';

let pn_dinfo_topic = '/Mobius/' + GcsName + '/Drone_Info_Data/Panel';

let pn_offset_topic = '/Mobius/' + GcsName + '/Offset_Data/' + DroneName + '/Panel';

let ant_type = '';

mavPortOpening();

tr_mqtt_connect('localhost');

function mavPortOpening() {
    if (!mavPort) {
        mavPort = new SerialPort({
            path: mavPortNum,
            baudRate: parseInt(mavBaudrate, 10),
        });
        mavPort.on('open', mavPortOpen);
        mavPort.on('close', mavPortClose);
        mavPort.on('error', mavPortError);
        mavPort.on('data', mavPortData);
    }
    else {
        if (mavPort.isOpen) {
            mavPort.close();
            mavPort = null;
            setTimeout(mavPortOpening, 2000);
        }
        else {
            mavPort.open();
        }
    }
}

function mavPortOpen() {
    console.log('mavPort(' + mavPort.path + '), mavPort rate: ' + mavPort.baudRate + ' open.');

    send_param_get_command();
}

function mavPortClose() {
    console.log('mavPort closed.');

    setTimeout(mavPortOpening, 2000);
}

function mavPortError(error) {
    console.log('[mavPort error]: ' + error.message);

    setTimeout(mavPortOpening, 2000);
}

let mavStrFromDrone = '';
let mavStrFromDroneLength = 0;
let mavVersion = 'unknown';
let mavVersionCheckFlag = false;

function mavPortData(data) {
    mavStrFromDrone += data.toString('hex').toLowerCase();

    while (mavStrFromDrone.length > 20) {
        let stx;
        let len;
        let mavLength;
        let sysid;
        let msgid;
        let mavPacket;

        if (!mavVersionCheckFlag) {
            stx = mavStrFromDrone.substring(0, 2);

            if (stx === 'fe') {
                len = parseInt(mavStrFromDrone.substring(2, 4), 16);
                mavLength = (6 * 2) + (len * 2) + (2 * 2);
                sysid = parseInt(mavStrFromDrone.substring(6, 8), 16);
                msgid = parseInt(mavStrFromDrone.substring(10, 12), 16);

                if (msgid === 0 && len === 9) { // HEARTBEAT
                    mavVersionCheckFlag = true;
                    mavVersion = 'v1';
                }

                if ((mavStrFromDrone.length) >= mavLength) {
                    mavPacket = mavStrFromDrone.substring(0, mavLength);

                    mavStrFromDrone = mavStrFromDrone.substring(mavLength);
                    mavStrFromDroneLength = 0;
                }
                else {
                    break;
                }
            }
            else if (stx === 'fd') {
                len = parseInt(mavStrFromDrone.substring(2, 4), 16);
                mavLength = (10 * 2) + (len * 2) + (2 * 2);

                sysid = parseInt(mavStrFromDrone.substring(10, 12), 16);
                msgid = parseInt(mavStrFromDrone.substring(18, 20) + mavStrFromDrone.substring(16, 18) + mavStrFromDrone.substring(14, 16), 16);

                if (msgid === 0 && len === 9) { // HEARTBEAT
                    mavVersionCheckFlag = true;
                    mavVersion = 'v2';
                }
                if (mavStrFromDrone.length >= mavLength) {
                    mavPacket = mavStrFromDrone.substring(0, mavLength);

                    mavStrFromDrone = mavStrFromDrone.substring(mavLength);
                    mavStrFromDroneLength = 0;
                }
                else {
                    break;
                }
            }
            else {
                mavStrFromDrone = mavStrFromDrone.substring(2);
            }
        }
        else {
            stx = mavStrFromDrone.substring(0, 2);
            if (mavVersion === 'v1' && stx === 'fe') {
                len = parseInt(mavStrFromDrone.substring(2, 4), 16);
                mavLength = (6 * 2) + (len * 2) + (2 * 2);

                if ((mavStrFromDrone.length) >= mavLength) {
                    mavPacket = mavStrFromDrone.substring(0, mavLength);

                    setTimeout(parseMavFromDrone, 0, mavPacket);

                    mavStrFromDrone = mavStrFromDrone.substring(mavLength);
                    mavStrFromDroneLength = 0;
                }
                else {
                    break;
                }
            }
            else if (mavVersion === 'v2' && stx === 'fd') {
                len = parseInt(mavStrFromDrone.substring(2, 4), 16);
                mavLength = (10 * 2) + (len * 2) + (2 * 2);

                if (mavStrFromDrone.length >= mavLength) {
                    mavPacket = mavStrFromDrone.substring(0, mavLength);

                    setTimeout(parseMavFromDrone, 0, mavPacket);

                    mavStrFromDrone = mavStrFromDrone.substring(mavLength);
                    mavStrFromDroneLength = 0;
                }
                else {
                    break;
                }
            }
            else {
                mavStrFromDrone = mavStrFromDrone.substring(2);
            }
        }
    }
}

function send_param_get_command(){
    let btn_params = {};
    btn_params.target_system = 254;
    btn_params.target_component = -1;
    btn_params.param_id = "AHRS_ORIENTATION";
    btn_params.param_index = -1;

    try {
        let msg = mavlinkGenerateMessage(255, 0xbe, mavlink.MAVLINK_MSG_ID_PARAM_REQUEST_READ, btn_params);
        if (!msg) {
            console.log("mavlink message is null");
        }
        else {
            if (mavPort) {
                if (mavPort.isOpen) {
                    mavPort.write(msg, () => {
                        console.log('Send AHRS_ORIENTATION param get command.');
                    });
                }
            }
        }
    }
    catch (ex) {
        console.log('[ERROR] ' + ex);
    }

    if (ant_type === '') {
        setTimeout(send_param_get_command, 1000);
    }
}
function tr_mqtt_connect(serverip) {
    if (!tr_mqtt_client) {
        let connectOptions = {
            host: serverip,
            port: 1883,
            protocol: "mqtt",
            keepalive: 10,
            clientId: 'get_tracker_FC_' + nanoid(15),
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
            console.log('tr_mqtt_client is connected ' + serverip);

            if (pn_dinfo_topic !== '') {
                tr_mqtt_client.subscribe(pn_dinfo_topic, () => {
                    console.log('[tr_mqtt_client] pn_ctrl_topic is subscribed -> ', pn_dinfo_topic);
                });
            }
            if (pn_offset_topic !== '') {
                tr_mqtt_client.subscribe(pn_offset_topic, () => {
                    console.log('[tr_mqtt_client] pn_offset_topic is subscribed -> ', pn_offset_topic);
                });
            }
        });

        tr_mqtt_client.on('error', (err) => {
            console.log('[tr_mqtt_client error] ' + err.message);
        });

        tr_mqtt_client.on('message', (topic, message) => {
            if (topic === pn_dinfo_topic) { // 모터 제어 메세지 수신
                let drone_info = JSON.parse(message.toString());
                fs.writeFileSync('./drone_info.json', JSON.stringify(drone_info, null, 4), 'utf8');
            }
            else if (topic === pn_offset_topic) {
                let offsetObj = JSON.parse(message.toString());
                console.log('offsetObj -', offsetObj);
                if (offsetObj.hasOwnProperty('type')) {
                    let btn_params;
                    if (offsetObj.type === "T90") {
                        btn_params = {};
                        btn_params.target_system = 254;
                        btn_params.target_component = 1;
                        btn_params.param_id = "AHRS_ORIENTATION";
                        btn_params.param_type = mavlink.MAV_PARAM_TYPE_INT8;
                        btn_params.param_value = 24; // PITCH90
                    }
                    else {
                        btn_params = {};
                        btn_params.target_system = 254;
                        btn_params.target_component = 1;
                        btn_params.param_id = "AHRS_ORIENTATION";
                        btn_params.param_type = mavlink.MAV_PARAM_TYPE_INT8;
                        btn_params.param_value = 0; // None
                    }
                    try {
                        let msg = mavlinkGenerateMessage(255, 0xbe, mavlink.MAVLINK_MSG_ID_PARAM_SET, btn_params);
                        if (!msg) {
                            console.log("mavlink message is null");
                        }
                        else {
                            if (mavPort) {
                                if (mavPort.isOpen) {
                                    mavPort.write(msg, () => {
                                        console.log('Send AHRS_ORIENTATION param set command.');
                                    });
                                }
                            }
                        }
                    }
                    catch (ex) {
                        console.log('[ERROR] ' + ex);
                    }
                }
            }
        });
    }
}

function parseMavFromDrone(mavPacket) {
    try {
        let ver = mavPacket.substring(0, 2);
        let msg_len = parseInt(mavPacket.substring(2, 4), 16);
        let sys_id = '';
        let msg_id = '';
        let base_offset = 12;

        if (ver === 'fd') {
            sys_id = parseInt(mavPacket.substring(10, 12).toLowerCase(), 16);
            msg_id = parseInt(mavPacket.substring(18, 20) + mavPacket.substring(16, 18) + mavPacket.substring(14, 16), 16);
            base_offset = 20;
        }
        else {
            sys_id = parseInt(mavPacket.substring(6, 8).toLowerCase(), 16);
            msg_id = parseInt(mavPacket.substring(10, 12).toLowerCase(), 16);
            base_offset = 12;
        }

        if (msg_id === mavlink.MAVLINK_MSG_ID_GLOBAL_POSITION_INT) { // #33
            let my_len = 28;
            let ar = mavPacket.split('');
            for (let i = 0; i < (my_len - msg_len); i++) {
                ar.splice(ar.length - 4, 0, '0');
                ar.splice(ar.length - 4, 0, '0');
            }
            mavPacket = ar.join('');

            let time_boot_ms = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            let lat = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            let lon = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            let alt = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            let relative_alt = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            let vx = mavPacket.substring(base_offset, base_offset + 4).toLowerCase();
            base_offset += 4;
            let vy = mavPacket.substring(base_offset, base_offset + 4).toLowerCase();
            base_offset += 4;
            let vz = mavPacket.substring(base_offset, base_offset + 4).toLowerCase();
            base_offset += 4;
            let hdg = mavPacket.substring(base_offset, base_offset + 4).toLowerCase();

            let _global_position_int_msg = {};

            _global_position_int_msg.time_boot_ms = Buffer.from(time_boot_ms, 'hex').readUInt32LE(0);
            _global_position_int_msg.lat = Buffer.from(lat, 'hex').readInt32LE(0);
            _global_position_int_msg.lon = Buffer.from(lon, 'hex').readInt32LE(0);
            _global_position_int_msg.alt = Buffer.from(alt, 'hex').readInt32LE(0);
            _global_position_int_msg.relative_alt = Buffer.from(relative_alt, 'hex').readInt32LE(0);
            _global_position_int_msg.vx = Buffer.from(vx, 'hex').readInt16LE(0);
            _global_position_int_msg.vy = Buffer.from(vy, 'hex').readInt16LE(0);
            _global_position_int_msg.vz = Buffer.from(vz, 'hex').readInt16LE(0);
            _global_position_int_msg.hdg = Buffer.from(hdg, 'hex').readUInt16LE(0);

            let _lat = _global_position_int_msg.lat / 10000000;
            let _lon = _global_position_int_msg.lon / 10000000
            if ((33 < _lat && _lat < 43) && ((124 < _lon && _lon < 132))) {
                // console.log('[_global_position_int_msg] -> ', _global_position_int_msg.lat, _global_position_int_msg.lon, _global_position_int_msg.hdg);

                global_position_int_msg = JSON.parse(JSON.stringify(_global_position_int_msg));
                position_refresh_flag = 1;

            }
            else {
                _global_position_int_msg.lat = global_position_int_msg.lat;
                _global_position_int_msg.lon = global_position_int_msg.lon;

                global_position_int_msg = JSON.parse(JSON.stringify(_global_position_int_msg));
                position_refresh_flag = 1;
            }

            if (tr_mqtt_client) {
                tr_mqtt_client.publish(gps_pos_topic, JSON.stringify(global_position_int_msg), () => {
                    console.log('publish globalpositionint_msg to local mqtt(' + gps_pos_topic + ') : ', JSON.stringify(global_position_int_msg));
                });
            }
        }
        else if (msg_id === mavlink.MAVLINK_MSG_ID_ATTITUDE) {
            let my_len = 28;
            let ar = mavPacket.split('');
            for (let i = 0; i < (my_len - msg_len); i++) {
                ar.splice(ar.length - 4, 0, '0');
                ar.splice(ar.length - 4, 0, '0');
            }
            mavPacket = ar.join('');

            let time_boot_ms = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            let roll = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            let pitch = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            let yaw = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            let rollspeed = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            let pitchspeed = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            let yawspeed = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();

            let _attitude_msg = {};
            _attitude_msg.time_boot_ms = Buffer.from(time_boot_ms, 'hex').readUInt32LE(0);
            _attitude_msg.roll = Buffer.from(roll, 'hex').readFloatLE(0);
            _attitude_msg.pitch = Buffer.from(pitch, 'hex').readFloatLE(0);
            _attitude_msg.yaw = Buffer.from(yaw, 'hex').readFloatLE(0);
            _attitude_msg.rollspeed = Buffer.from(rollspeed, 'hex').readFloatLE(0);
            _attitude_msg.pitchspeed = Buffer.from(pitchspeed, 'hex').readFloatLE(0);
            _attitude_msg.yawspeed = Buffer.from(yawspeed, 'hex').readFloatLE(0);

            if (_attitude_msg.yaw < 0) {
                _attitude_msg.yaw += (2 * Math.PI);
            }

            let tracker_yaw = Math.round(((_attitude_msg.yaw * 180) / Math.PI) * 10) / 10;
            console.log('[yaw] -> ', tracker_yaw);

            let tracker_pitch = Math.round(((_attitude_msg.pitch * 180) / Math.PI) * 10) / 10;
            console.log('[pitch] -> ', tracker_pitch);

            attitude_msg = JSON.parse(JSON.stringify(_attitude_msg));

            if (tr_mqtt_client) {
                tr_mqtt_client.publish(gps_alt_topic, JSON.stringify(attitude_msg), () => {
                    console.log('publish attitude_msg to local mqtt(' + gps_alt_topic + ') : ', JSON.stringify(attitude_msg));
                });
            }
        }
        else if (msg_id === mavlink.MAVLINK_MSG_ID_GPS_RAW_INT) {
            let my_len = 30;
            if (ver === 'fd') {
                my_len += 22;
            }
            let ar = mavPacket.split('');
            for (let i = 0; i < (my_len - msg_len); i++) {
                ar.splice(ar.length - 4, 0, '0');
                ar.splice(ar.length - 4, 0, '0');
            }
            mavPacket = ar.join('');

            let time_boot_ms = mavPacket.substring(base_offset, base_offset + 16).toLowerCase();
            base_offset += 16;
            let lat = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            let lon = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            let alt = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            let eph = mavPacket.substring(base_offset, base_offset + 4).toLowerCase();
            base_offset += 4;
            let epv = mavPacket.substring(base_offset, base_offset + 4).toLowerCase();
            base_offset += 4;
            let vel = mavPacket.substring(base_offset, base_offset + 4).toLowerCase();
            base_offset += 4;
            let cog = mavPacket.substring(base_offset, base_offset + 4).toLowerCase();
            base_offset += 4;
            let fix_type = mavPacket.substring(base_offset, base_offset + 2).toLowerCase();
            base_offset += 2;
            let satellites_visible = mavPacket.substring(base_offset, base_offset + 2).toLowerCase();
            base_offset += 2;

            let _gps_raw_int_msg = {};
            _gps_raw_int_msg.fix_type = Buffer.from(fix_type, 'hex').readUInt8(0);
            _gps_raw_int_msg.satellites_visible = Buffer.from(satellites_visible, 'hex').readUInt8(0);

            gps_raw_int_msg = JSON.parse(JSON.stringify(_gps_raw_int_msg));

            if (tr_mqtt_client) {
                tr_mqtt_client.publish(gps_raw_topic, JSON.stringify(gps_raw_int_msg), () => {
                    console.log('publish gps_raw_int_msg to local mqtt(' + gps_raw_topic + ') : ', JSON.stringify(gps_raw_int_msg));
                });
            }
        }
        else if (msg_id === mavlink.MAVLINK_MSG_ID_PARAM_VALUE) {
            let my_len = 25;
            let ar = mavPacket.split('');
            for (let i = 0; i < (my_len - msg_len); i++) {
                ar.splice(ar.length-4, 0, '0');
                ar.splice(ar.length-4, 0, '0');
            }
            mavPacket = ar.join('');

            var param_value = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            var param_count = mavPacket.substring(base_offset, base_offset + 4).toLowerCase();
            base_offset += 4;
            var param_index = mavPacket.substring(base_offset, base_offset + 4).toLowerCase();
            base_offset += 4;
            var param_id = mavPacket.substring(base_offset, base_offset + 32).toLowerCase();
            base_offset += 32;
            var param_type = mavPacket.substring(base_offset, base_offset + 2).toLowerCase();

            param_id = Buffer.from(param_id, "hex").toString('ASCII');

            if (param_id.includes('AHRS_ORIENTATION')) {
                param_value = Buffer.from(param_value, 'hex').readFloatLE(0);

                if (param_value.toString() === '0') {
                    ant_type = "T0";
                }
                else if (param_value.toString() === '24') {
                    ant_type = "T90";
                }

                if (tr_mqtt_client) {
                    tr_mqtt_client.publish(gps_type_topic, ant_type, () => {
                        console.log('publish ahrs_orientation_msg to local mqtt(' + gps_type_topic + ') : ', ant_type);
                    });
                }
            }
        }
    }
    catch (e) {
        console.log('[parseMavFromDrone Error]', e);
    }
}

function mavlinkGenerateMessage(src_sys_id, src_comp_id, type, params) {
    const mavlinkParser = new MAVLink(null/*logger*/, src_sys_id, src_comp_id, mavVersion);
    let mavMsg = null;
    let genMsg = null;
    try {
        //var targetSysId = sysId;
        // eslint-disable-next-line no-unused-vars
        //var targetCompId = (params.targetCompId === undefined) ? 0 : params.targetCompId;

        switch (type) {
            // MESSAGE ////////////////////////////////////
            case mavlink.MAVLINK_MSG_ID_PARAM_SET:
                mavMsg = new mavlink.messages.param_set(
                    params.target_system,
                    params.target_component,
                    params.param_id,
                    params.param_value,
                    params.param_type
                );
                break;
            case mavlink.MAVLINK_MSG_ID_PARAM_REQUEST_READ:
                mavMsg = new mavlink.messages.param_request_read(
                    params.target_system,
                    params.target_component,
                    params.param_id,
                    params.param_index
                );
                break;
        }
    }
    catch (e) {
        console.log('MAVLINK EX:' + e);
    }

    if (mavMsg) {
        genMsg = Buffer.from(mavMsg.pack(mavlinkParser));
        //console.log('>>>>> MAVLINK OUTGOING MSG: ' + genMsg.toString('hex'));
    }

    return genMsg;
}
