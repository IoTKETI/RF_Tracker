const mqtt = require('mqtt');
const {nanoid} = require("nanoid");
const fs = require('fs');

let local_mqtt_client = null;
let pub_target_gpi_topic = '/Ant_Tracker/target_drone/gpi';  // Send mavlink(#33, GLOBAL_POSITION_INT) to Motors
let sub_pan_motor_position_topic = '/Ant_Tracker/Motor_Pan';
let sub_tilt_motor_position_topic = '/Ant_Tracker/Motor_Tilt';
let pub_motor_control_topic = '/Ant_Tracker/Control';
let pub_motor_altitude_topic = '/Ant_Tracker/Altitude';

let gcs_mqtt_client = null;
let sub_target_gpi_topic = '/TELE_HUB/drone/gpi';  // Recieve mavlink(#33, GLOBAL_POSITION_INT) from GCS
let pub_pan_motor_position_topic = '/Ant_Tracker/Motor_Pan';
let pub_tilt_motor_position_topic = '/Ant_Tracker/Motor_Tilt';
let sub_motor_control_topic = '/Ant_Tracker/Control';
let sub_motor_altitude_topic = '/Ant_Tracker/Altitude';

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

    gcs_mqtt_connect(drone_info.gcs_ip);
}

function local_mqtt_connect(serverip) {
    let connectOptions = {
        host: serverip,
        port: 1883,
        protocol: "mqtt",
        keepalive: 10,
        clientId: 'local_target_drone_rf_' + nanoid(15),
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

        local_mqtt_client.publish('/Ant_Tracker/Control', 'run'); // TODO: 드론 heartbeat 값 받아서 시동 걸리면 run 시작하도록?
    });

    local_mqtt_client.on('message', (topic, message) => {
        if (topic === sub_pan_motor_position_topic) {
            if (gcs_mqtt_client !== null) {
                gcs_mqtt_client.publish(pub_pan_motor_position_topic, message);
            }
        }
        else if (topic === sub_tilt_motor_position_topic) {
            if (gcs_mqtt_client !== null) {
                gcs_mqtt_client.publish(pub_tilt_motor_position_topic, message);
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

function gcs_mqtt_connect(serverip) {
    let connectOptions = {
        host: serverip,
        port: 1883,
        protocol: "mqtt",
        keepalive: 10,
        clientId: 'local_target_drone_rf_' + nanoid(15),
        protocolId: "MQTT",
        protocolVersion: 4,
        clean: true,
        reconnectPeriod: 2 * 1000,
        connectTimeout: 30 * 1000,
        queueQoSZero: false,
        rejectUnauthorized: false
    }

    gcs_mqtt_client = mqtt.connect(connectOptions);

    gcs_mqtt_client.on('connect', function () {
        console.log('gcs_mqtt_client is connected to GCS ( ' + serverip + ' )');

        if (sub_target_gpi_topic !== '') {
            gcs_mqtt_client.subscribe(sub_target_gpi_topic, () => {
                console.log('[gcs_mqtt_client] sub_target_gpi_topic is subscribed -> ', sub_target_gpi_topic);
            });
        }
        if (sub_motor_control_topic !== '') {
            gcs_mqtt_client.subscribe(sub_motor_control_topic, () => {
                console.log('[gcs_mqtt_client] sub_motor_control_topic is subscribed -> ', sub_motor_control_topic);
            });
        }
        if (sub_motor_altitude_topic !== '') {
            gcs_mqtt_client.subscribe(sub_motor_altitude_topic, () => {
                console.log('[gcs_mqtt_client] sub_motor_altitude_topic is subscribed -> ', sub_motor_altitude_topic);
            });
        }
    });

    gcs_mqtt_client.on('message', function (topic, message) {
        //console.log('[gcs] topic, message => ', topic, message.toString('hex'));

        if (topic.includes(sub_target_gpi_topic)) {
            let mavPacket = message.toString('hex');
            if (local_mqtt_client !== null) {
                local_mqtt_client.publish(pub_target_gpi_topic, message, () => {
                    console.log('Send target drone data(' + mavPacket + ') to ' + pub_target_gpi_topic);
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

    gcs_mqtt_client.on('error', function (err) {
        console.log('[gcs_mqtt_client] error - ' + err.message);
    });
}

//---------------------------------------------------
