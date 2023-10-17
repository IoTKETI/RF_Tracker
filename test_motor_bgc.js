const {SerialPort} = require('serialport');
const {nanoid} = require("nanoid");
const mqtt = require("mqtt");

let mobius_mqtt_client = null;

let rc_topic = '/Mobius/KETI_MUV/RC_Data/KETI_AIoT_02';

let sbus1Port = null;
let sbus1PortNum = '/dev/ttyAMA2';
let sbus1Baudrate = 115200;

let sbus_gen_tid = null;

const crc8_Table = [
    0, 94, 188, 226, 97, 63, 221, 131, 194, 156, 126, 32, 163, 253, 31, 65,  // 0 ~ 15
    157, 195, 33, 127, 252, 162, 64, 30, 95, 1, 227, 189, 62, 96, 130, 220,  // 16 ~ 31
    35, 125, 159, 193, 66, 28, 254, 160, 225, 191, 93, 3, 128, 222, 60, 98,  // 32 ~ 47
    190, 224, 2, 92, 223, 129, 99, 61, 124, 34, 192, 158, 29, 67, 161, 255,		// 48 ~ 63
    70, 24, 250, 164, 39, 121, 155, 197, 132, 218, 56, 102, 229, 187, 89, 7,  // 64 ~ 79
    219, 133, 103, 57, 186, 228, 6, 88, 25, 71, 165, 251, 120, 38, 196, 154,  // 80 ~ 95
    101, 59, 217, 135, 4, 90, 184, 230, 167, 249, 27, 69, 198, 152, 122, 36,   // 96 ~ 111
    248, 166, 68, 26, 153, 199, 37, 123, 58, 100, 134, 216, 91, 5, 231, 185,  // 112 ~ 127
    140, 210, 48, 110, 237, 179, 81, 15, 78, 16, 242, 172, 47, 113, 147, 205,  // 128 ~ 143
    17, 79, 173, 243, 112, 46, 204, 146, 211, 141, 111, 49, 178, 236, 14, 80,  // 144 ~ 159
    175, 241, 19, 77, 206, 144, 114, 44, 109, 51, 209, 143, 12, 82, 176, 238,  // 160 ~ 175
    50, 108, 142, 208, 83, 13, 239, 177, 240, 174, 76, 18, 145, 207, 45, 115,  // 176 ~ 191
    202, 148, 118, 40, 171, 245, 23, 73, 8, 86, 180, 234, 105, 55, 213, 139, // 192 ~ 207
    87, 9, 235, 181, 54, 104, 138, 212, 149, 203, 41, 119, 244, 170, 72, 22,  // 208 ~ 223
    233, 183, 85, 11, 136, 214, 52, 106, 43, 117, 151, 201, 74, 20, 246, 168,  // 224 ~ 239
    116, 42, 200, 150, 21, 75, 169, 247, 182, 232, 10, 84, 215, 137, 107, 53  // 240 ~ 255
];

let sbus1PortOpening = () => {
    if (!sbus1Port) {
        sbus1Port = new SerialPort({
            path: sbus1PortNum,
            baudRate: parseInt(sbus1Baudrate, 10)
        });

        sbus1Port.on('open', () => {
            console.log('sbus1Port(' + sbus1Port.path + '), sbus1Port rate: ' + sbus1Port.baudRate + ' open.');

            // setTimeout(init, 1000);
            mobius_mqtt_connect('gcs.iotocean.org');
        });

        sbus1Port.on('close', () => {
            console.log('sbus1Port closed.');

            setTimeout(sbus1PortOpening, 2000);
        });

        sbus1Port.on('error', (error) => {
            console.log('[sbus1Port error]: ' + error.message);

            setTimeout(sbus1PortOpening, 2000);
        });
    }
    else {
        if (sbus1Port.isOpen) {
            sbus1Port.close();
            sbus1Port = null;
            //setTimeout(sbus1PortOpening, 2000);
        }
        else {
            sbus1Port.open();
        }
    }
}

function mobius_mqtt_connect(serverip) {
    if (!mobius_mqtt_client) {
        let connectOptions = {
            host: serverip,
            port: 1883,
            protocol: "mqtt",
            keepalive: 10,
            clientId: 'mobius_mqtt_client_' + nanoid(15),
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
            console.log('mobius_mqtt_client is connected to ( ' + serverip + ' )');

            if (rc_topic !== '') {
                mobius_mqtt_client.subscribe(rc_topic, () => {
                    console.log('[mobius_mqtt_client] rc_topic is subscribed: ' + rc_topic);
                });
            }
        });

        mobius_mqtt_client.on('message', (topic, message) => {
            if (topic === rc_topic) {
                let RC_data = message.toString('hex');
                let sequence = parseInt(RC_data.substring(0, 2), 16);
                let rcRawData = RC_data.slice(2);

                if (sbus1Port) {
                    sbus1Port.write(Buffer.from(rcRawData, 'hex'), () => {
                        // console.log(Buffer.from(rcRawData, 'hex'));
                    });
                }
            }
        });

        mobius_mqtt_client.on('error', (err) => {
            console.log('[mobius_mqtt_client error] ' + err.message);
        });
    }
}

let Calc_CRC_8 = (DataArray, Length) => {
    let i;
    let crc;

    crc = 0x01;
    DataArray = Buffer.from(DataArray, 'hex');
    for (i = 1; i < Length; i++) {
        crc = crc8_Table[crc ^ DataArray[i]];
    }
    return crc;
}

const CH_VAL_MAX = 225;
const CH_VAL_MID = 128;
const CH_VAL_MIN = 25;

let sbus_ch_val = [
    255,
    CH_VAL_MID,
    CH_VAL_MID,
    CH_VAL_MID,
    CH_VAL_MID,
    CH_VAL_MIN,
    CH_VAL_MIN,
    CH_VAL_MIN,
    CH_VAL_MIN,
    CH_VAL_MIN,
    CH_VAL_MIN,
    CH_VAL_MID,
    CH_VAL_MIN,
    CH_VAL_MIN,
    CH_VAL_MIN,
    CH_VAL_MIN,
    CH_VAL_MIN,
];

let SbusDataGenerator = () => {
    let neutralSbus = 'ff7d7d7d7d3819e11919191919191919197d7d7d7d191919191919191919191919';

    neutralSbus += Calc_CRC_8(neutralSbus, neutralSbus.length / 2).toString(16).padStart(2, '0');

    if (sbus1Port) {
        sbus1Port.write(Buffer.from(neutralSbus, 'hex'), () => {
            // console.log(Buffer.from(SBUS1_Buffer, 'hex'));
        });
    }
}

let init = () => {
    if(sbus_gen_tid) {
        clearInterval(sbus_gen_tid);
        sbus_gen_tid = null;
    }

    sbus_gen_tid = setInterval(SbusDataGenerator, 50);
}

sbus1PortOpening();
