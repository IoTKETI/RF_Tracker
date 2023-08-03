const mqtt = require('mqtt');
const {nanoid} = require("nanoid");
const fs = require('fs');

const mavlink = require('./mavlibrary/mavlink.js');

let local_mqtt_client = null;
let pub_target_gpi_topic = '/Ant_Tracker/target_drone/gpi';  // Send mavlink(#33, GLOBAL_POSITION_INT) to Motors
let sub_pan_motor_position_topic = '/Ant_Tracker/Motor_Pan';
let sub_tilt_motor_position_topic = '/Ant_Tracker/Motor_Tilt';
let pub_motor_control_topic = '/Ant_Tracker/Control';
let pub_motor_altitude_topic = '/Ant_Tracker/Altitude';

let mqtt_client = null;
let rf_lte_pub_drone_topic = '/RF/TELE_HUB/drone';
let rf_lte_sub_gcs_topic = '/RF/TELE/gcs';
let rf_lte_sub_rc_topic = '/RF/RC'; // 드론에 RF 통신으로 전달하기 위한 토픽
let sub_motor_control_topic = '/Ant_Tracker/Control';
let sub_motor_altitude_topic = '/Ant_Tracker/Altitude';
let pub_pan_motor_position_topic = '/Ant_Tracker/Motor_Pan';
let pub_tilt_motor_position_topic = '/Ant_Tracker/Motor_Tilt';

let rf_mqtt_client = null;
let rf_sub_drone_topic = '/RF/TELE_HUB/drone';  // Recieve mavlink from GCS
let rf_pub_gcs_topic = '/RF/TELE/gcs';
let rf_pub_rc_topic = '/RF/RC'; // 드론에 RF 통신으로 전달하기 위한 토픽

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

    local_mqtt_connect('localhost');

    mqtt_connect(drone_info.host);

    let host_arr = drone_info.gcs_ip.split('.');
    host_arr[3] = drone_info.system_id.toString();
    let drone_ip = host_arr.join('.');

    rf_mqtt_connect(drone_ip);
}

function local_mqtt_connect(serverip) {
    let connectOptions = {
        host: serverip,
        port: 1883,
        protocol: "mqtt",
        keepalive: 10,
        clientId: 'local_target_drone_rf_lte_' + nanoid(15),
        protocolId: "MQTT",
        protocolVersion: 4,
        clean: true,
        reconnectPeriod: 2 * 1000,
        connectTimeout: 30 * 1000,
        queueQoSZero: false,
        rejectUnauthorized: false
    }

    local_mqtt_client = mqtt.connect(connectOptions);

    local_mqtt_client.on('connect', () => {
        console.log('local_mqtt_client is connected to ' + serverip);

        if (sub_pan_motor_position_topic !== '') {
            local_mqtt_client.subscribe(sub_pan_motor_position_topic, () => {
                console.log('[local_mqtt_client] sub_pan_motor_position_topic is subscribed -> ' + sub_pan_motor_position_topic);
            })
        }
        if (sub_tilt_motor_position_topic !== '') {
            local_mqtt_client.subscribe(sub_tilt_motor_position_topic, () => {
                console.log('[local_mqtt_client] sub_tilt_motor_position_topic is subscribed -> ' + sub_tilt_motor_position_topic);
            })
        }

        local_mqtt_client.publish('/Ant_Tracker/Control', 'run'); // TODO: 드론 heartbeat 보고 시동 걸리면 run 시작하도록? 아니면 heartbeat 파싱하는 부분 제거
    });

    local_mqtt_client.on('message', (topic, message) => {
        if (topic === sub_pan_motor_position_topic) {
            if (mqtt_client !== null) {
                mqtt_client.publish(pub_pan_motor_position_topic, message);
            }
        }
        else if (topic === sub_tilt_motor_position_topic) {
            if (mqtt_client !== null) {
                mqtt_client.publish(pub_tilt_motor_position_topic, message);
            }
        }
        else {
            console.log('[local_mqtt_client] Received ' + message.toString() + ' From ' + topic);
        }
    });

    local_mqtt_client.on('error', (err) => {
        console.log('[local_mqtt_client] error - ' + err.message);
    });
}

function mqtt_connect(serverip) {
    let connectOptions = {
        host: serverip,
        port: 1883,
        protocol: "mqtt",
        keepalive: 10,
        clientId: 'target_drone_rf_lte_' + nanoid(15),
        protocolId: "MQTT",
        protocolVersion: 4,
        clean: true,
        reconnectPeriod: 2 * 1000,
        connectTimeout: 30 * 1000,
        queueQoSZero: false,
        rejectUnauthorized: false
    }

    mqtt_client = mqtt.connect(connectOptions);

    mqtt_client.on('connect', () => {
        console.log('mqtt_client is connected to GCS ( ' + serverip + ' )');

        if (rf_lte_sub_gcs_topic !== '') {
            mqtt_client.subscribe(rf_lte_sub_gcs_topic, () => {
                console.log('[mqtt_client] rf_lte_sub_gcs_topic is subscribed -> ', rf_lte_sub_gcs_topic);
            });
        }
        if (rf_lte_sub_rc_topic !== '') {
            mqtt_client.subscribe(rf_lte_sub_rc_topic, () => {
                console.log('[mqtt_client] rf_lte_sub_rc_topic is subscribed -> ', rf_lte_sub_rc_topic);
            });
        }
        if (sub_motor_control_topic !== '') {
            mqtt_client.subscribe(sub_motor_control_topic, () => {
                console.log('[gcs_mqtt_client] sub_motor_control_topic is subscribed -> ', sub_motor_control_topic);
            });
        }
        if (sub_motor_altitude_topic !== '') {
            mqtt_client.subscribe(sub_motor_altitude_topic, () => {
                console.log('[gcs_mqtt_client] sub_motor_altitude_topic is subscribed -> ', sub_motor_altitude_topic);
            });
        }
    });

    mqtt_client.on('message', (topic, message) => {
        if (topic === rf_lte_sub_gcs_topic) {
            if (rf_mqtt_client !== null) {
                rf_mqtt_client.publish(rf_pub_gcs_topic, message, () => {
                    console.log('Send target drone command(' + message.toString('hex') + ') to ' + rf_pub_gcs_topic);
                });
            }
        }
        else if (topic === rf_lte_sub_rc_topic) {
            if (rf_mqtt_client !== null) {
                rf_mqtt_client.publish(rf_pub_rc_topic, message, () => {
                    console.log('Send RC(' + message.toString('hex') + ') to ' + rf_pub_rc_topic);
                });
            }
        }
        else if (topic === sub_motor_control_topic) {
            if (local_mqtt_client !== null) {
                local_mqtt_client.publish(pub_motor_control_topic, message.toString(), () => {
                    // console.log('send motor control message: ', motor_control_topic, message.toString());
                });
            }
        }
        else if (topic === sub_motor_altitude_topic) {
            if (local_mqtt_client !== null) {
                local_mqtt_client.publish(pub_motor_altitude_topic, message.toString(), () => {
                    // console.log('send motor control message: ', motor_control_topic, message.toString());
                });
            }
        }
    });

    mqtt_client.on('error', (err) => {
        console.log('[mqtt_client] error - ' + err.message);
    });
}

function rf_mqtt_connect(serverip) {
    let connectOptions = {
        host: serverip,
        port: 1883,
        protocol: "mqtt",
        keepalive: 10,
        clientId: 'rf_target_drone_rf_lte_' + nanoid(15),
        protocolId: "MQTT",
        protocolVersion: 4,
        clean: true,
        reconnectPeriod: 2 * 1000,
        connectTimeout: 30 * 1000,
        queueQoSZero: false,
        rejectUnauthorized: false
    }

    rf_mqtt_client = mqtt.connect(connectOptions);

    rf_mqtt_client.on('connect', () => {
        console.log('rf_mqtt_client is connected to GCS ( ' + serverip + ' )');

        rf_mqtt_client.subscribe(rf_sub_drone_topic, () => {
            console.log('[rf_mqtt_client] rf_sub_drone_topic is subscribed -> ', rf_sub_drone_topic);
        });
    });

    rf_mqtt_client.on('message', (topic, message) => {
        if (topic === rf_sub_drone_topic) {
            // console.log('fromDrone: ' + message.toString('hex'))
            setTimeout(parseMavFromDrone, 0, message.toString('hex'));

            if (mqtt_client !== null) {
                mqtt_client.publish(rf_sub_drone_topic, message);
            }
        }
    });

    rf_mqtt_client.on('error', (err) => {
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

            if (local_mqtt_client !== null) {
                local_mqtt_client.publish(pub_target_gpi_topic, JSON.stringify(global_position_int), () => {
                    // console.log('publish to GCS - ', '/gcs/TELE_HUB/drone/rf', mavPacket);
                });
            }
        }

        if (mqtt_client !== null) {
            mqtt_client.publish(rf_lte_pub_drone_topic, Buffer.from(mavPacket, 'hex'), () => {
                // console.log('publish to GCS - ', '/gcs/TELE_HUB/drone/rf', mavPacket);
            });
        }
    }
    catch (e) {
        console.log('[parseMavFromDrone Error]', e);
    }
}
