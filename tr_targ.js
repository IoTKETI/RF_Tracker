const mqtt = require('mqtt');
const {nanoid} = require("nanoid");
const fs = require('fs');

const mavlink = require('./mavlibrary/mavlink.js');

let GcsName = 'KETI_GCS';
let DroneName = 'KETI_Simul_1';

let pn_ctrl_topic = '/Mobius/GcsName/Ctrl_Data/Panel';
let pn_alt_topic = '/Mobius/GcsName/Alt_Data/Panel';

let dr_data_topic = '/Mobius/' + GcsName + '/Drone_Data/' + DroneName + '/#';

let tr_data_topic = '/Mobius/' + GcsName + '/Tr_Data/#';

let tr_mqtt_client = null;

let pub_target_gpi_topic = '/Ant_Tracker/target_drone/gpi';  // Send mavlink(#33, GLOBAL_POSITION_INT) to Motors
let sub_pan_motor_position_topic = '/Ant_Tracker/Motor_Pan';
let sub_tilt_motor_position_topic = '/Ant_Tracker/Motor_Tilt';



let dr_mqtt_client = null;
let rf_lte_pub_drone_topic = '/RF/TELE_HUB/drone';
let rf_lte_sub_gcs_topic = '/RF/TELE/gcs';
let rf_lte_sub_rc_topic = '/RF/RC'; // 드론에 RF 통신으로 전달하기 위한 토픽



let pub_pan_motor_position_topic = '/Ant_Tracker/Motor_Pan';
let pub_tilt_motor_position_topic = '/Ant_Tracker/Motor_Tilt';

let mobius_mqtt_client = null;
let rf_sub_drone_topic = '/RF/TELE_HUB/drone';  // Recieve mavlink from GCS
let rf_pub_gcs_topic = '/RF/TELE/gcs';
let rf_pub_rc_topic = '/RF/RC'; // 드론에 RF 통신으로 전달하기 위한 토픽

let sitl_state = true;

let sitl_mqtt_client = null;
let sub_sitl_drone_data_topic = '';

let my_sortie_name = 'unknown';

let drone_info = {};

init();

function init() {
    try {
        drone_info = JSON.parse(fs.readFileSync('./drone_info.json', 'utf8'));
    }
    catch (e) {
        console.log('can not find [ ./drone_info.json ] file');
        drone_info.id = "Dione";
        drone_info.approval_gcs = "MUV";
        drone_info.host = "121.137.228.240";
        drone_info.drone = "Drone1";
        drone_info.gcs = "KETI_GCS";
        drone_info.type = "ardupilot";
        drone_info.system_id = 1;
        drone_info.gcs_ip = "192.168.1.150";

        fs.writeFileSync('./drone_info.json', JSON.stringify(drone_info, null, 4), 'utf8');
    }

    tr_mqtt_connect('localhost');

    dr_mqtt_connect(drone_info.host);

    let host_arr = drone_info.gcs_ip.split('.');
    host_arr[3] = drone_info.system_id.toString();
    let drone_ip = host_arr.join('.');

    mobius_mqtt_connect(drone_ip);
}

function tr_mqtt_connect(serverip) {
    let connectOptions = {
        host: serverip,
        port: 1883,
        protocol: "mqtt",
        keepalive: 10,
        clientId: 'tr_mqtt_' + nanoid(15),
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
        console.log('tr_mqtt_client is connected to ' + serverip);

        if (tr_data_topic !== '') {
            tr_mqtt_client.subscribe(tr_data_topic, () => {
                console.log('[tr_mqtt_client] tr_data_topic is subscribed -> ' + tr_data_topic);
            });
        }
    });

    tr_mqtt_client.on('message', (topic, message) => {
        if (mobius_mqtt_client !== null) {
            let _tr_data_topic = tr_data_topic;
            if (topic.includes('/pan')) {
                _tr_data_topic = tr_data_topic.replace('/#', '/pan')
            }
            else if (topic.includes('/tilt')) {
                _tr_data_topic = tr_data_topic.replace('/#', '/tilt')
            }

            if (topic === _tr_data_topic) {
                mobius_mqtt_client.publish(topic, message);
            }
        }
    });

    tr_mqtt_client.on('error', (err) => {
        console.log('[local_mqtt_client] error - ' + err.message);
    });
}

function dr_mqtt_connect(serverip) {
    let connectOptions = {
        host: serverip,
        port: 1883,
        protocol: "mqtt",
        keepalive: 10,
        clientId: 'dr_mqtt_' + nanoid(15),
        protocolId: "MQTT",
        protocolVersion: 4,
        clean: true,
        reconnectPeriod: 2 * 1000,
        connectTimeout: 30 * 1000,
        queueQoSZero: false,
        rejectUnauthorized: false
    }

    dr_mqtt_client = mqtt.connect(connectOptions);

    dr_mqtt_client.on('connect', () => {
        console.log('dr_mqtt_client is connected to ' + serverip);

        if (dr_data_topic !== '') {
            dr_mqtt_client.subscribe(dr_data_topic, () => {
                console.log('[dr_mqtt_client] dr_data_topic is subscribed -> ', dr_data_topic);
            });
        }
    });

    dr_mqtt_client.on('message', (topic, message) => {
        let _dr_data_topic = dr_data_topic.replace('/#', '');
        let arr_topic = topic.split('/');
        let _topic = arr_topic.splice(0, arr_topic.length-1).join('/');


        if (_topic === _dr_data_topic) {
            tr_message_handler(topic, message);
        }
    });

    dr_mqtt_client.on('error', (err) => {
        console.log('[mqtt_client] error - ' + err.message);
    });
}

let tr_message_handler = (topic, message) => {
    // TODO: 메시지 중복 처리 할 것
    if (tr_mqtt_client !== null) {
        let result = parseMavFromDrone(message.toString('hex'));

        if(result) {
            tr_mqtt_client.publish(topic, message, () => {
                console.log('Send target drone data(' + message.toString('hex') + ') to ' + topic);
            });
        }
    }
}

function mobius_mqtt_connect(serverip) {
    let connectOptions = {
        host: serverip,
        port: 1883,
        protocol: "mqtt",
        keepalive: 10,
        clientId: 'mobius_mqtt_' + nanoid(15),
        protocolId: "MQTT",
        protocolVersion: 4,
        clean: true,
        reconnectPeriod: 2 * 1000,
        connectTimeout: 30 * 1000,
        queueQoSZero: false,
        rejectUnauthorized: false
    }

    mobius_mqtt_client = mqtt.connect(connectOptions);

    mobius_mqtt_client.on('connect', () => {
        console.log('mobius_mqtt_client is connected to ' + serverip);

        mobius_mqtt_client.subscribe(dr_data_topic, () => {
            console.log('[mobius_mqtt_client] dr_data_topic is subscribed -> ', dr_data_topic);
        });

        mobius_mqtt_client.subscribe(pn_ctrl_topic, () => {
            console.log('[mobius_mqtt_client] pn_ctrl_topic is subscribed -> ' + pn_ctrl_topic);
        });

        mobius_mqtt_client.subscribe(pn_alt_topic, () => {
            console.log('[mobius_mqtt_client] pn_alt_topic is subscribed -> ' + pn_alt_topic);
        });
    });

    mobius_mqtt_client.on('message', (topic, message) => {
        let _dr_data_topic = dr_data_topic.replace('/#', '');
        let arr_topic = topic.split('/');
        let _topic = arr_topic.splice(0, arr_topic.length-1).join('/');


        if (_topic === _dr_data_topic) {
            tr_message_handler(topic, message);
        }
        else if (topic === pn_ctrl_topic) {
            if (tr_mqtt_client !== null) {
                tr_mqtt_client.publish(topic, message);
            }
        }
    });

    mobius_mqtt_client.on('error', (err) => {
        console.log('[rf_mqtt_client] error - ' + err.message);
    });
}

let flag_base_mode = 0;
let heartbeat = {};
let global_position_int = {};

function parseMavFromDrone(mavPacket) {
    try {
        let ver = mavPacket.substring(0, 2);
        let cur_seq;
        let sys_id;
        let msg_id;
        let base_offset;

        if (ver === 'fd') {
            msg_id = parseInt(mavPacket.substring(18, 20) + mavPacket.substring(16, 18) + mavPacket.substring(14, 16), 16);
            base_offset = 20;
        }
        else {
            msg_id = parseInt(mavPacket.substring(10, 12).toLowerCase(), 16);
            base_offset = 12;
        }

        if (msg_id === mavlink.MAVLINK_MSG_ID_HEARTBEAT) { // #00 : HEARTBEAT
            let custom_mode = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            let type = mavPacket.substring(base_offset, base_offset + 2).toLowerCase();
            base_offset += 2;
            let autopilot = mavPacket.substring(base_offset, base_offset + 2).toLowerCase();
            base_offset += 2;
            let base_mode = mavPacket.substring(base_offset, base_offset + 2).toLowerCase();
            base_offset += 2;
            let system_status = mavPacket.substring(base_offset, base_offset + 2).toLowerCase();
            base_offset += 2;
            let mavlink_version = mavPacket.substring(base_offset, base_offset + 2).toLowerCase();

            heartbeat.type = Buffer.from(type, 'hex').readUInt8(0);
            if (heartbeat.type !== mavlink.MAV_TYPE_ADSB) {
                heartbeat.autopilot = Buffer.from(autopilot, 'hex').readUInt8(0);
                heartbeat.base_mode = Buffer.from(base_mode, 'hex').readUInt8(0);
                heartbeat.custom_mode = Buffer.from(custom_mode, 'hex').readUInt32LE(0);
                heartbeat.system_status = Buffer.from(system_status, 'hex').readUInt8(0);
                heartbeat.mavlink_version = Buffer.from(mavlink_version, 'hex').readUInt8(0);

                let armStatus = (heartbeat.base_mode & 0x80) === 0x80;

                if (armStatus) {
                    flag_base_mode++;
                    if (flag_base_mode === 3) {
                        my_sortie_name = 'arm';
                    }
                }
                else {
                    flag_base_mode = 0;
                    my_sortie_name = 'disarm';
                }
            }

            return 1;
        }
        else if (msg_id === mavlink.MAVLINK_MSG_ID_GLOBAL_POSITION_INT) { // #33
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

            global_position_int.time_boot_ms = Buffer.from(time_boot_ms, 'hex').readUInt32LE(0);
            global_position_int.lat = Buffer.from(lat, 'hex').readInt32LE(0);
            global_position_int.lon = Buffer.from(lon, 'hex').readInt32LE(0);
            global_position_int.alt = Buffer.from(alt, 'hex').readInt32LE(0);
            global_position_int.relative_alt = Buffer.from(relative_alt, 'hex').readInt32LE(0);
            global_position_int.vx = Buffer.from(vx, 'hex').readInt16LE(0);
            global_position_int.vy = Buffer.from(vy, 'hex').readInt16LE(0);
            global_position_int.vz = Buffer.from(vz, 'hex').readInt16LE(0);
            global_position_int.hdg = Buffer.from(hdg, 'hex').readUInt16LE(0);

            return 1;
        }

        return 0;
    }
    catch (e) {
        console.log('[parseMavFromDrone Error]', e);
    }
}
