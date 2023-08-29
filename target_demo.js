const mqtt = require('mqtt');
const {nanoid} = require("nanoid");
const fs = require('fs');

const mavlink = require('./mavlibrary/mavlink.js');

let local_mqtt_client = null;
let pub_target_gpi_topic = '/Target/Tracker/gpi';  // Send mavlink(#33, GLOBAL_POSITION_INT) to Motors
let sub_pan_motor_position_topic = '/Ant_Tracker/Motor_Pan';
let sub_tilt_motor_position_topic = '/Ant_Tracker/Motor_Tilt';
let pub_motor_control_topic = '/Panel/Tracker/control';
let pub_motor_altitude_topic = '/Panel/Tracker/altitude';

let mqtt_client = null;
let sub_motor_control_topic = '/Panel/Tracker/control';
let sub_motor_altitude_topic = '/Panel/Tracker/altitude';
let pub_pan_motor_position_topic = '/Ant_Tracker/Motor_Pan';
let pub_tilt_motor_position_topic = '/Ant_Tracker/Motor_Tilt';

let sub_sitl_drone_topic = '/Mobius/KETI_GCS/Drone_Data/KETI_Simul_1';

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

    mqtt_connect("gcs.iotocean.org");
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

        if (sub_motor_control_topic !== '') {
            mqtt_client.subscribe(sub_motor_control_topic, () => {
                console.log('[mqtt_client] sub_motor_control_topic is subscribed -> ', sub_motor_control_topic);
            });
        }
        if (sub_motor_altitude_topic !== '') {
            mqtt_client.subscribe(sub_motor_altitude_topic, () => {
                console.log('[mqtt_client] sub_motor_altitude_topic is subscribed -> ', sub_motor_altitude_topic);
            });
        }
        if (sub_sitl_drone_topic !== '') {
            mqtt_client.subscribe(sub_sitl_drone_topic + '/#', () => {
                console.log('[mqtt_client] sub_sitl_drone_topic is subscribed -> ', sub_sitl_drone_topic + '/#');
            });
        }
    });

    mqtt_client.on('message', (topic, message) => {
        if (topic.includes(sub_sitl_drone_topic)) {
            setTimeout(parseMavFromDrone, 0, message.toString('hex'));
        }
        else if (topic === sub_motor_control_topic) {
            if (local_mqtt_client !== null) {
                local_mqtt_client.publish(pub_motor_control_topic, message.toString(), () => {
                    console.log('send motor control message: ', pub_motor_control_topic, message.toString());
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

            global_position_int.time_boot_ms = Buffer.from(time_boot_ms, 'hex').readUInt32LE(0);
            global_position_int.lat = Buffer.from(lat, 'hex').readInt32LE(0);
            global_position_int.lon = Buffer.from(lon, 'hex').readInt32LE(0);
            global_position_int.alt = Buffer.from(alt, 'hex').readInt32LE(0);
            global_position_int.relative_alt = Buffer.from(relative_alt, 'hex').readInt32LE(0);
            global_position_int.vx = Buffer.from(vx, 'hex').readInt16LE(0);
            global_position_int.vy = Buffer.from(vy, 'hex').readInt16LE(0);
            global_position_int.vz = Buffer.from(vz, 'hex').readInt16LE(0);
            global_position_int.hdg = Buffer.from(hdg, 'hex').readUInt16LE(0);
            console.log(global_position_int);

            if (local_mqtt_client !== null) {
                local_mqtt_client.publish(pub_target_gpi_topic, JSON.stringify(global_position_int), () => {
                    // console.log('publish to GCS - ', pub_target_gpi_topic, JSON.stringify(global_position_int));
                });
            }
        }
    }
    catch (e) {
        console.log('[parseMavFromDrone Error]', e);
    }
}
