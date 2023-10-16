const {SerialPort} = require('serialport');

let sbus1Port = null;
let sbus1PortNum = '/dev/ttyAMA3';
let sbus1Baudrate = 100000;

let sequence = 0;
let sbus_gen_tid = null;

const CH_SCALE = 8;

let SBUS1_CH = new Uint16Array([1024, 1024, 1024, 1024, 1024, 223, 223, 1024, 223, 223, 223, 1024, 223, 223, 223, 223, 223, 223]);

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

            //setTimeout(init, 1000);
        });

        sbus1Port.on('close', () => {
            console.log('sbus1Port closed.');

            setTimeout(sbus1PortOpening, 2000);
        });

        sbus1Port.on('error', () => {
            console.log('[sbus1Port error]: ' + error.message);

            setTimeout(sbus1PortOpening, 2000);
        });

        // sbus1Port.on('data', (data) => {
        //     //let _resData = data.toString('hex').toLowerCase();
        //
        //     //_resData = (sequence.toString(16).padStart(2, '0')) + _resData;
        //
        //     // if (dr_mqtt_client) {
        //     //     dr_mqtt_client.publish(res_topic, Buffer.from(_resData, 'hex'));
        //     // }
        //     //
        //     // if (mobius_mqtt_client) {
        //     //     mobius_mqtt_client.publish(res_topic, Buffer.from(_resData, 'hex'));
        //     // }
        //
        //     //sequence++;
        //     //sequence %= 255;
        // });
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
const CH_VAL_MIDMIN = 56;
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
    CH_VAL_MID,
    CH_VAL_MIN,
    CH_VAL_MIN,
    CH_VAL_MIN,
    CH_VAL_MIN,
    CH_VAL_MIN,
    CH_VAL_MIN,
];

let SbusDataGenerator = () => {
    //let neutralSbus = '';
    // for(let i in sbus_ch_val) {
    //     neutralSbus += sbus_ch_val[i].toString(16);
    // }
    //let neutralSbus = sbus_ch_val.toString(16);
    //neutralSbus += Calc_CRC_8(neutralSbus, (sbus_ch_val.length)/2).toString(16).padStart(2, '0');

    //console.log(neutralSbus);

    let neutralSbus = 'ff7d7d7d7d191919191919191919191919';

    Parse_RcData(neutralSbus);

    setTimeout(SbusDataGenerator, 30);
}

let Parse_RcData = (rc_str) => {
    let GCS_DataBuffer = Buffer.from(rc_str, 'hex');

    //let GCS_DataBuffer = rc_str;


    SBUS1_CH[0] = GCS_DataBuffer[1] * CH_SCALE + 1;
    SBUS1_CH[1] = GCS_DataBuffer[2] * CH_SCALE + 1;
    SBUS1_CH[2] = GCS_DataBuffer[3] * CH_SCALE + 1;
    SBUS1_CH[3] = GCS_DataBuffer[4] * CH_SCALE + 1;
    SBUS1_CH[4] = GCS_DataBuffer[5] * CH_SCALE + 1;
    SBUS1_CH[5] = GCS_DataBuffer[6] * CH_SCALE + 1;
    SBUS1_CH[6] = GCS_DataBuffer[7] * CH_SCALE + 1;
    SBUS1_CH[7] = GCS_DataBuffer[8] * CH_SCALE + 1;
    SBUS1_CH[8] = GCS_DataBuffer[9] * CH_SCALE + 1;
    SBUS1_CH[9] = GCS_DataBuffer[10] * CH_SCALE + 1;
    SBUS1_CH[10] = GCS_DataBuffer[11] * CH_SCALE + 1;
    SBUS1_CH[11] = GCS_DataBuffer[12] * CH_SCALE + 1;
    SBUS1_CH[12] = GCS_DataBuffer[13] * CH_SCALE + 1;
    SBUS1_CH[13] = GCS_DataBuffer[14] * CH_SCALE + 1;
    SBUS1_CH[14] = GCS_DataBuffer[15] * CH_SCALE + 1;
    SBUS1_CH[15] = GCS_DataBuffer[16] * CH_SCALE + 1;

    //console.log(SBUS1_CH);


    sbus1Packet_Generator(SBUS1_CH);
}

let sbus1Packet_Generator = (SBUS_CH) => {
    let SBUS_Buffer = [];
    SBUS_Buffer.push(0x0f);
    SBUS_Buffer.push((SBUS_CH[0] & 0x07FF));
    SBUS_Buffer.push((SBUS_CH[0] & 0x07FF) >> 8 | (SBUS_CH[1] & 0x07FF) << 3);
    SBUS_Buffer.push((SBUS_CH[1] & 0x07FF) >> 5 | (SBUS_CH[2] & 0x07FF) << 6);
    SBUS_Buffer.push((SBUS_CH[2] & 0x07FF) >> 2);
    SBUS_Buffer.push((SBUS_CH[2] & 0x07FF) >> 10 | (SBUS_CH[3] & 0x07FF) << 1);
    SBUS_Buffer.push((SBUS_CH[3] & 0x07FF) >> 7 | (SBUS_CH[4] & 0x07FF) << 4);
    SBUS_Buffer.push((SBUS_CH[4] & 0x07FF) >> 4 | (SBUS_CH[5] & 0x07FF) << 7);
    SBUS_Buffer.push((SBUS_CH[5] & 0x07FF) >> 1);
    SBUS_Buffer.push((SBUS_CH[5] & 0x07FF) >> 9 | (SBUS_CH[6] & 0x07FF) << 2);
    SBUS_Buffer.push((SBUS_CH[6] & 0x07FF) >> 6 | (SBUS_CH[7] & 0x07FF) << 5);
    SBUS_Buffer.push((SBUS_CH[7] & 0x07FF) >> 3);
    SBUS_Buffer.push((SBUS_CH[8] & 0x07FF));
    SBUS_Buffer.push((SBUS_CH[8] & 0x07FF) >> 8 | (SBUS_CH[9] & 0x07FF) << 3);
    SBUS_Buffer.push((SBUS_CH[9] & 0x07FF) >> 5 | (SBUS_CH[10] & 0x07FF) << 6);
    SBUS_Buffer.push((SBUS_CH[10] & 0x07FF) >> 2);
    SBUS_Buffer.push((SBUS_CH[10] & 0x07FF) >> 10 | (SBUS_CH[11] & 0x07FF) << 1);
    SBUS_Buffer.push((SBUS_CH[11] & 0x07FF) >> 7 | (SBUS_CH[12] & 0x07FF) << 4);
    SBUS_Buffer.push((SBUS_CH[12] & 0x07FF) >> 4 | (SBUS_CH[13] & 0x07FF) << 7);
    SBUS_Buffer.push((SBUS_CH[13] & 0x07FF) >> 1);
    SBUS_Buffer.push((SBUS_CH[13] & 0x07FF) >> 9 | (SBUS_CH[14] & 0x07FF) << 2);
    SBUS_Buffer.push((SBUS_CH[14] & 0x07FF) >> 6 | (SBUS_CH[15] & 0x07FF) << 5);
    SBUS_Buffer.push((SBUS_CH[15] & 0x07FF) >> 3);

    SBUS_Buffer.push(0x00);
    SBUS_Buffer.push(0x00);

    //console.log('SBUS1_Buffer -\t\t', Buffer.from(SBUS_Buffer, 'hex'));

    if (sbus1Port) {
        sbus1Port.write(Buffer.from(SBUS_Buffer, 'hex'), () => {
            // console.log(Buffer.from(SBUS1_Buffer, 'hex'));
        });
    }
}

exports.setDelta = (pan_diff_angle, tilt_diff_angle) => {
    // pan
    sbus_ch_val[4] = CH_VAL_MID + pan_diff_angle;
    if(sbus_ch_val[4] >= CH_VAL_MAX) {
        sbus_ch_val[4] = CH_VAL_MAX;
    }
    else if(sbus_ch_val[4] <= CH_VAL_MIN) {
        sbus_ch_val[4] = CH_VAL_MIN;
    }

    // tilt
    sbus_ch_val[2] = CH_VAL_MID + tilt_diff_angle;
    if(sbus_ch_val[2] >= CH_VAL_MAX) {
        sbus_ch_val[2] = CH_VAL_MAX;
    }
    else if(sbus_ch_val[2] <= CH_VAL_MIN) {
        sbus_ch_val[2] = CH_VAL_MIN;
    }
}

exports.setStop = () => {
    sbus_ch_val[4] = CH_VAL_MID;
    sbus_ch_val[2] = CH_VAL_MID;
}

let init = () => {
    if(sbus_gen_tid) {
        clearInterval(sbus_gen_tid);
        sbus_gen_tid = null;
    }

    sbus_gen_tid = setInterval(SbusDataGenerator, 50);
}

sbus1PortOpening();

setTimeout(SbusDataGenerator, 1000);