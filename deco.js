function readUInt16LE(bytes) {
    return (bytes[1] << 8) + bytes[0];
}

function readInt16LE(bytes) {
    const ref = readUInt16LE(bytes);
    return ref > 0x7FFF ? ref - 0x10000 : ref;
}

function readUInt32LE(bytes) {
    return (bytes[3] << 24) + (bytes[2] << 16) + (bytes[1] << 8) + bytes[0];
}

function readInt32LE(bytes) {
    const ref = readUInt32LE(bytes);
    return ref > 0x7FFFFFFF ? ref - 0x100000000 : ref;
}

function am103l(byteArray) {
    const decoded = {};
    let i = 0;

    while (i < byteArray.length) {
        const channelId = byteArray[i];
        i += 1;
        if (i >= byteArray.length) break;
        const channelType = byteArray[i];
        i += 1;

        // BATTERY
        if (channelId === 0x01 && channelType === 0x75) {
            decoded.battery = byteArray[i];
            i += 1;
        }
        // TEMPERATURE
        else if (channelId === 0x03 && channelType === 0x67) {
            decoded.temperature = readInt16LE(byteArray.slice(i, i + 2)) / 10;
            i += 2;
        }
        // HUMIDITY
        else if (channelId === 0x04 && channelType === 0x68) {
            decoded.humidity = byteArray[i] / 2;
            i += 1;
        }
        // CO2
        else if (channelId === 0x07 && channelType === 0x7D) {
            decoded.co2 = readUInt16LE(byteArray.slice(i, i + 2));
            i += 2;
        }
        // HISTORY DATA
        else if (channelId === 0x20 && channelType === 0xCE) {
            const historyData = {
                timestamp: readUInt32LE(byteArray.slice(i, i + 4)),
                temperature: readInt16LE(byteArray.slice(i + 4, i + 6)) / 10,
                humidity: byteArray[i + 6] / 2,
                co2: readUInt16LE(byteArray.slice(i + 7, i + 9))
            };
            i += 9;

            if (!decoded.history) {
                decoded.history = [];
            }
            decoded.history.push(historyData);
        } else {
            break;
        }
    }

    return decoded;
}

function ws301(bytesData) {
    const decoded = {};
    let i = 0;

    while (i < bytesData.length) {
        const channelId = bytesData[i];
        i += 1;
        const channelType = bytesData[i];
        i += 1;

        // BATTERY
        if (channelId === 0x01 && channelType === 0x75) {
            decoded.battery = bytesData[i];
            i += 1;
        }
        // DOOR / WINDOW STATE (0: close, 1: open)
        else if (channelId === 0x03 && channelType === 0x00) {
            decoded.magnet_status = bytesData[i] === 0 ? "close" : "open";
            i += 1;
        }
        // INSTALL STATE (0: install, 1: uninstall)
        else if (channelId === 0x04 && channelType === 0x00) {
            decoded.tamper_status = bytesData[i] === 0 ? "installed" : "uninstalled";
            i += 1;
        } else {
            break;
        }
    }

    return decoded;
}

module.exports = {
    am103l: am103l,
    ws301: ws301
};