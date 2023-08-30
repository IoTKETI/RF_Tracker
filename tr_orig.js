const {SerialPort} = require('serialport');
const mqtt = require('mqtt');
const {nanoid} = require('nanoid');

const mavlink = require('./mavlibrary/mavlink.js');

let mavPortNum = '/dev/ttyAMA0';
let mavBaudrate = '115200';
let mavPort = null;

let tracker_latitude = 37.4036621604629;
let tracker_longitude = 127.16176249708046;
let tracker_altitude = 0.0;
let tracker_relative_altitude = 0.0;
let tracker_heading = 0.0;


let globalpositionint_msg = {};
//let pre_globalpositionint_msg = {};
let attitude_msg = {};
let pre_attitude_msg = {};
let position_refresh_flag = 0;
let attitude_refresh_flag = 0;

globalpositionint_msg.lat = 37.4036621604629;
globalpositionint_msg.lon = 127.16176249708046;
globalpositionint_msg.alt = 0.0;
globalpositionint_msg.relative_alt = 0.0;
globalpositionint_msg.hdg = 0.0;

pre_globalpositionint_msg = JSON.parse(JSON.stringify(globalpositionint_msg));


attitude_msg.yaw = 0.0;
pre_attitude_msg = JSON.parse(JSON.stringify(attitude_msg));

let GcsName = 'KETI_GCS'

let tr_mqtt_client = null;
let gps_pos_topic = '/Mobius/' + GcsName + '/Pos_Data/GPS';
let gps_alt_topic = '/Mobius/' + GcsName + '/Att_Data/GPS';

mavPortOpening();

tr_mqtt_connect('localhost');

function mavPortOpening() {
    if (mavPort === null) {
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

function tr_mqtt_connect(serverip) {
    if (tr_mqtt_client === null) {
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
            console.log('local_mqtt_client is connected ' + serverip);
        });

        tr_mqtt_client.on('error', (err) => {
            console.log('[local_mqtt_client error] ' + err.message);
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

            let _globalpositionint_msg = {};

            _globalpositionint_msg.time_boot_ms = Buffer.from(time_boot_ms, 'hex').readUInt32LE(0);
            _globalpositionint_msg.lat = Buffer.from(lat, 'hex').readInt32LE(0);
            _globalpositionint_msg.lon = Buffer.from(lon, 'hex').readInt32LE(0);
            _globalpositionint_msg.alt = Buffer.from(alt, 'hex').readInt32LE(0);
            _globalpositionint_msg.relative_alt = Buffer.from(relative_alt, 'hex').readInt32LE(0);
            _globalpositionint_msg.vx = Buffer.from(vx, 'hex').readInt16LE(0);
            _globalpositionint_msg.vy = Buffer.from(vy, 'hex').readInt16LE(0);
            _globalpositionint_msg.vz = Buffer.from(vz, 'hex').readInt16LE(0);
            _globalpositionint_msg.hdg = Buffer.from(hdg, 'hex').readUInt16LE(0);


            let _lat = _globalpositionint_msg.lat / 10000000;
            let _lon = _globalpositionint_msg.lon / 10000000
            if((33 < _lat && _lat < 43) && ((124 < _lon && _lon < 132) )) {
                // console.log('[_globalpositionint_msg] -> ', _globalpositionint_msg.lat, _globalpositionint_msg.lon, _globalpositionint_msg.hdg);

                globalpositionint_msg = JSON.parse(JSON.stringify(_globalpositionint_msg));
                position_refresh_flag = 1;

            }
            else {
                // console.log('[pre_globalpositionint_msg] -> ', _globalpositionint_msg.lat, _globalpositionint_msg.lon, _globalpositionint_msg.hdg);

                _globalpositionint_msg.lat = globalpositionint_msg.lat;
                _globalpositionint_msg.lon = globalpositionint_msg.lon;

                globalpositionint_msg = JSON.parse(JSON.stringify(_globalpositionint_msg));
                position_refresh_flag = 1;
            }

            if (tr_mqtt_client !== null) {
                tr_mqtt_client.publish(gps_pos_topic, JSON.stringify(globalpositionint_msg), () => {
                    console.log('publish globalpositionint_msg to local mqtt(' + gps_pos_topic + ') : ', JSON.stringify(globalpositionint_msg));
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

            if(_attitude_msg.yaw < 0) {
                _attitude_msg.yaw += (2 * Math.PI);
            }

            let tracker_yaw = Math.round(((_attitude_msg.yaw * 180)/Math.PI) * 10)/10;
            console.log('[yaw] -> ', tracker_yaw);

            let tracker_pitch = Math.round(((_attitude_msg.pitch * 180)/Math.PI) * 10)/10;
            console.log('[pitch] -> ', tracker_pitch);

            attitude_msg = JSON.parse(JSON.stringify(_attitude_msg));

            if (tr_mqtt_client !== null) {
                tr_mqtt_client.publish(gps_alt_topic, JSON.stringify(attitude_msg), () => {
                    console.log('publish attitude_msg to local mqtt('+gps_alt_topic+') : ', JSON.stringify(attitude_msg));
                });
            }
        }
    }
    catch (e) {
        console.log('[parseMavFromDrone Error]', e);
    }
}

let sendPosition = () => {
    if(position_refresh_flag) {
        position_refresh_flag = 0;
        if (tr_mqtt_client !== null) {
            tr_mqtt_client.publish(gps_pos_topic, JSON.stringify(globalpositionint_msg), () => {
                console.log('publish globalpositionint_msg to local mqtt(' + gps_pos_topic + ') : ', JSON.stringify(globalpositionint_msg));
            });
        }
    }
    //else {
        //if (local_mqtt_client !== null) {
            //local_mqtt_client.publish(pub_gps_position_topic, JSON.stringify(pre_globalpositionint_msg), () => {
                //console.log('publish globalpositionint_msg to local mqtt(' + pub_gps_position_topic + ') : ', JSON.stringify(pre_globalpositionint_msg));
            //});
        //}
    //}
}

let sendAttitude = () => {
    if(attitude_refresh_flag) {
        attitude_refresh_flag = 0;
        if (tr_mqtt_client !== null) {
            tr_mqtt_client.publish(gps_alt_topic, JSON.stringify(attitude_msg), () => {
                console.log('publish attitude_msg to local mqtt('+gps_alt_topic+') : ', JSON.stringify(attitude_msg));
            });
        }
    }
    // else {
    //     if (local_mqtt_client !== null) {
    //         local_mqtt_client.publish(pub_gps_attitude_topic, JSON.stringify(pre_attitude_msg), () => {
    //             console.log('publish attitude_msg to local mqtt('+pub_gps_attitude_topic+') : ', JSON.stringify(pre_attitude_msg));
    //         });
    //     }
    // }
}

//setInterval(sendPosition, 2000);
//setInterval(sendAttitude, 1000);

