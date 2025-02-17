'use strict'

const mqtt = require('mqtt');
const grpc = require('@grpc/grpc-js');
const fs = require('fs');
const path = require('path');
const {getApiKey, getTenantId, getApplicationId, 
    createDevice, createDevProfileId,
    updateDeviceProfile, deleteDeviceProfile,
    enqueueDevPacket, findDeviceDevEui, deleteDevice,
    //activateDeviceRequest, deactivateDeviceRequest, 
    getGatewayById, createGateway, deleteGateway, 
    getGatewayState, getGatewayList, updateGateway,
    createApplication, getApplicationList, deleteApplication} = require('./chirpstack_cmds');
const { am103l, ws301} = require('./deco');

// ============================ Variables ============================ //

// Amazon MQTT Server
const AMAZON_MQTT_BROKER = "a265m6rkc34opn-ats.iot.us-east-1.amazonaws.com";
const AMAZON_MQTT_PORT = 8883;
const AMAZON_MQTT_CLIENT_ID = 'homebrella_lns_02';

// Definir los topics
const AMAZON_COMMANDS_TOPIC = `homebrella/${AMAZON_MQTT_CLIENT_ID}/api`;
const AMAZON_EVENTS_TOPIC = `homebrella/${AMAZON_MQTT_CLIENT_ID}/events`;
const AMAZON_DEVICES_TOPIC = `homebrella/${AMAZON_MQTT_CLIENT_ID}/devices`;

const FIRST_RECONNECT_DELAY = 1;
const RECONNECT_RATE = 2;
const MAX_RECONNECT_COUNT = 12;
const MAX_RECONNECT_DELAY = 60;

let amazon_mqtt_client = null;
const amazon_keyfile = fs.readFileSync(path.join(__dirname, 'certs/homebrella_lns_02/homebrella_lns_02-private.pem.key'));
const amazon_certfile = fs.readFileSync(path.join(__dirname, 'certs/homebrella_lns_02/homebrella_lns_02-certificate.pem.crt'));
const amazon_ca_certs = fs.readFileSync(path.join(__dirname, 'certs/homebrella_lns_02/AmazonRootCA1.pem'));

// -------------------------- Chirpstack API ------------------------- #
const CHIRPSTACK_API_SERVER = '127.0.0.1:8080'
let chirpstack_api_token  = " "
let chirpstack_tenant_id  = " "
let chirpstack_app_id     = " "

const CHIRPSTACK_MQTT_BROKER = "127.0.0.1";
const CHIRPSTACK_MQTT_PORT = 1883;
const CHIRPSTACK_MQTT_CLIENT_ID = 'test_client_01';
const HOMEBRELLA_EVENTS_TOPIC = "hmain/events"
const HOMEBRELLA_CMDS_TOPIC   = "hmain/cmds"

let chirpstack_mqtt_client = " ";

// =========================== Functions ============================= //

// ------------------------- Parse Commands -------------------------- //
function commands_parse(jsonStr) {
    try {
        const jsonDict = JSON.parse(jsonStr);
        const command = jsonDict.command;
        const data = jsonDict.data;
        if (command === "create_device") {
            console.log("Create command received");

            const lorawanMetadata = data.lorawan_metadata;

            const devName   = data.device_name;
            const devDescr  = data.description;
            const devEui    = lorawanMetadata.DevEui;
            const devClass  = lorawanMetadata.DevClass;
            const devJoinEui = lorawanMetadata.JoinEui;
            const devAppKey  = lorawanMetadata.AppKey;
            
            try {
                const resp = createDevice(
                    chirpstack_api_token,
                    chirpstack_tenant_id,
                    chirpstack_app_id,
                    devEui,
                    devName,
                    devDescr,
                    devClass,
                    devJoinEui,
                    devAppKey
                );
                console.log("Llamada a createDevice respuesta: ", resp)
                return resp;
            } catch (e) {
                console.error("create_device -> Error", e);
                return 0;
            }
        } else if (command === "enqueue_packet") {
            console.log("Enqueue command received");

            const lorawanMetadata = data.lorawan_metadata;
            const payload = data.payload;

            const devEui = lorawanMetadata.DevEui;
            const port = lorawanMetadata.port;
            const confirmed = lorawanMetadata.confirmed;

            try {
                const resp = enqueueDevPacket(
                    chirpstack_api_token,
                    chirpstack_tenant_id,
                    chirpstack_app_id,
                    devEui,
                    port,
                    confirmed === "True",
                    payload
                );
                return resp;
            } catch (e) {
                console.error("enqueue_packet -> Error", e);
                return 0;
            }
        } else if (command === "delete_device") {
            console.log("Command received -> delete_device");

            const lorawanMetadata = data.lorawan_metadata;
            const devEui = lorawanMetadata.DevEui;

            try {
                const resp = deleteDevice(chirpstack_api_token, devEui);
                return resp;
            } catch (e) {
                console.error("delete_device -> Error", e);
                return 0;
            }
        } else if (command === "create_gateway") {
            console.log("Command received -> create_gateway");

            const gId   = data.gateway_id;
            const gName   = data.name;
            const gDescr  = data.description;

            try {
                const resp = createGateway(chirpstack_api_token, gId, gName, gDescr);
                return resp;
            } catch (e) {
                console.error("create_gateway -> Error", e);
                return 0;
            }
        } else if (command === "delete_gateway") {
            console.log("Command received -> delete_gateway");

            const gId = data.gateway_id;

            try {
                const resp = deleteGateway(gId);
                return resp;
            } catch (e) {
                console.error("delete_gateway -> Error", e);
                return 0;
            }
        } else if (command === "update_gateway") {
            console.log("Command received -> update_gateway");

            const gId   = data.gateway_id;
            const gName   = data.name;
            const gDescr  = data.description;

            try {
                const resp = updateGateway(chirpstack_api_token, gId, gName, gDescr);
                return resp;
            } catch (e) {
                console.error("update_gateway -> Error", e);
                return 0;
            }
        } else if (command === "create_application") {
            console.log("Command received -> create_application");

            const appKey   = data.apiKey;
            const appTenant = data.tenantId;
            const appName   = data.name;
            const appDescr  = data.description;

            try {
                const resp = createApplication(appTenant, appName, appDescr);
                return resp;
            } catch (e) {
                console.error("create_application -> Error", e);
                return 0;
            }
        }else if (command === "delete_application") {
            console.log("Command received -> delete_application");

            const appKey = data.apiKey;
            const appId = data.applicationId;

            try {
                const resp = deleteApplication(appKey, appId);
                return resp;
            } catch (e) {
                console.error("delete_application -> Error", e);
                return 0;
            }
        } else {
            return 2;
        }
    } catch (e) {
        return 2;
    }
}

// ============================ Amazon MQTT Functions ============================ //

function amazon_on_connect() {
    console.log("Conectado a Amazon MQTT Broker");
    amazon_mqtt_client.subscribe(AMAZON_COMMANDS_TOPIC);
    amazon_mqtt_client.publish(AMAZON_EVENTS_TOPIC, "LNS Connected!");

}

function amazon_on_disconnect() {
    console.log("Disconnected from Amazon MQTT Broker");
    reconnect_count = 0;
    reconnect_delay = FIRST_RECONNECT_DELAY;
    retry_connection();
}

function retry_connection() {
    if (reconnect_count >= MAX_RECONNECT_COUNT) {
        console.log("Reconnect failed after maximum attempts. Exiting...");
        return;
    }
    console.log(`Reconnecting in ${reconnect_delay} seconds...`);
    setTimeout(() => {
        try {
            amazon_mqtt_client.reconnect();
            console.log("Reconnected successfully!");
        } catch (err) {
            console.error("Reconnect failed. Retrying...", err);
            reconnect_delay *= RECONNECT_RATE;
            reconnect_delay = Math.min(reconnect_delay, MAX_RECONNECT_DELAY);
            reconnect_count++;
            retry_connection();
        }
    }, reconnect_delay * 1000);
}

function amazon_on_message(topic, message) {
    console.log(`Message received from ${topic}: ${message.toString()}`);
    const stat = commands_parse(message.toString());
    if (amazon_mqtt_client.connected) {
        if (stat === 1) {
            console.log("Command OK");
            amazon_mqtt_client.publish(AMAZON_COMMANDS_TOPIC, "OK");
        } else if (stat === 0) {
            console.log("Command Error");
            amazon_mqtt_client.publish(AMAZON_COMMANDS_TOPIC, "ERROR");
        }
    }
}

function amazon_connect_mqtt() {
    amazon_mqtt_client = mqtt.connect({
        host: AMAZON_MQTT_BROKER,
        port: AMAZON_MQTT_PORT,
        protocol: 'mqtts',
        clientId: AMAZON_MQTT_CLIENT_ID,
        key: amazon_keyfile,
        cert: amazon_certfile,
        ca: amazon_ca_certs
    });

    amazon_mqtt_client.on('connect', amazon_on_connect);
    amazon_mqtt_client.on('disconnect', amazon_on_disconnect);
    amazon_mqtt_client.on('message', amazon_on_message);
    amazon_mqtt_client.on('error', (err) => {
        console.error("Amazon MQTT Error:", err);
    });
}
// ============================ Chirpstack MQTT Functions ============================ //
function chirpstack_on_message(topic, message) {
    console.log(`Mensaje recibido en ${topic}:`, message.toString());

    try {
        const json_dict = JSON.parse(message.toString());
        const rxInfo = json_dict.rxInfo || [];
        const device = json_dict.deviceInfo?.deviceName || "";
        const encoded_data = json_dict.data;
        let decoded_payload = {};

        if (topic === HOMEBRELLA_EVENTS_TOPIC) {
            console.log("New Homebrella Event!");
            amazon_mqtt_client.publish(AMAZON_EVENTS_TOPIC, message.toString());
        } else {
            console.log("New uplink received!");

            const lns_dict = { lns: { id: rxInfo.length > 0 ? rxInfo[0].gatewayId : "" } };
            const new_dict = { payload: { nsproduct: "CHIRPSTACK", data: json_dict } };

            if (encoded_data) {
                try {
                    const byte_array = Buffer.from(encoded_data, 'base64');

                    if (device === 'AM103L') {
                        decoded_payload = am103l(Array.from(byte_array));
                    } else if (device === 'WS301') {
                        decoded_payload = ws301(Array.from(byte_array));
                    }

                    json_dict.decoded_data = decoded_payload;
                    console.log("Decoded Data:", decoded_payload);
                } catch (error) {
                    console.error("Error decoding Base64:", error);
                }
            }

            Object.assign(lns_dict, new_dict);
            amazon_mqtt_client.publish(AMAZON_DEVICES_TOPIC, JSON.stringify(decoded_payload));
        }
    } catch (error) {
        console.error("Error procesando el mensaje:", error);
    }
}

function chirpstack_on_connect(client, topic) {
    console.log("Conectado a Chirpstack MQTT");
    client.subscribe(topic, { qos: 1 }, (err) => {
        if (err) {
            console.error('Error al suscribirse:', err);
        } else {
            console.log(`Suscrito al tema: ${topic}`);
        }
    });
}

async function chirpstack_connect_mqtt() {
    try {
        

        const topic = `application/${chirpstack_app_id}/device/+/event/up`;

        const options = {
            host: CHIRPSTACK_MQTT_BROKER,
            port: CHIRPSTACK_MQTT_PORT,
            protocol: 'mqtt',
            clientId: CHIRPSTACK_MQTT_CLIENT_ID
        };
        
        chirpstack_mqtt_client = mqtt.connect(options);
        
        chirpstack_mqtt_client.on('connect', () => chirpstack_on_connect(chirpstack_mqtt_client, topic));
        chirpstack_mqtt_client.on('message', chirpstack_on_message);
        chirpstack_mqtt_client.on('error', (err) => console.error("Error en Chirpstack MQTT:", err));
        chirpstack_mqtt_client.on('close', () => console.log("Conexión con Chirpstack cerrada"));

    } catch (error) {
        console.error("Error al conectar con Chirpstack MQTT:", error);
    }
}

// ============================ Main Function ============================ //

async function main() {
    chirpstack_api_token = await getApiKey();
    chirpstack_tenant_id = await getTenantId(chirpstack_api_token);
    chirpstack_app_id = await getApplicationId(chirpstack_api_token, chirpstack_tenant_id);
    
    console.log("Iniciando conexión...");
    amazon_connect_mqtt();
    await chirpstack_connect_mqtt();


/*   
----------------------------crear dispositivo----------------------------
    const testJson = `{
        "command": "create_device",
        "data": {
            "device_name": "sensor_123",
            "description": "Sensor de temperatura",
            "lorawan_metadata": {
                "DevEui": "24E124725E032608",
                "DevClass": "A",
                "JoinEui": "24E124C0002A0001",
                "AppKey": "5572404C696E6B4C6F52613230313823"
            }
        }
    }`;     
----------------------------eliminar dispositivo---------------------------- 
    const testJson = `{
        "command": "delete_device",
        "data": {
            "lorawan_metadata": {
                "DevEui": "24E124725E032608"
            }
        }
    }`;   
----------------------------encolar paquete---------------------------- 
    const testJson =`{
        "command": "enqueue_packet",
        "data": {  
            "payload": "0011223344556677",
            "lorawan_metadata": {
                "DevEui": "24E124141E179436",
                "port": 10,
                "confirmed": "True"
            }
        }
    }`;
----------------------------crear gateway----------------------------        
    const testJson =`{
        "command": "create_gateway",
        "data": {  
            "gateway_id": "24E124FFFEF24B07",
            "name": "UG67",
            "description": "Milesight UG67"
            }
    }`; 
----------------------------eliminar gateway----------------------------
    const testJson =`{
        "command": "delete_gateway",
        "data": {  
            "gateway_id": "24E124FFFEF24B07"
            }
    }`;
----------------------------obtener estado gateway----------------------------
    const state = await getGatewayState(chirpstack_api_token, "24e124fffef24b07");
    console.log("GatewayState:", state);
----------------------------obtener listado gateways----------------------------
    const gateways = await getGatewayList(chirpstack_api_token);
    console.log("Lista de Gateways:", gateways);
----------------------------actualizar gateway----------------------------
    const testJson =`{
        "command": "update_gateway",
        "data": {  
            "gateway_id": "24E124FFFEF24B07",
            "name": "Gateway UG67",
            "description": "Milesight UG67"
            }
    }`; 
----------------------------find device----------------------------
    const apiKey = await getApiKey();  // Asegúrate de que esta función devuelve tu API Key correcta
    const appId = "63cf535c-0a81-49f8-b512-391b3d702d6a";  // Reemplaza con tu App ID real
    const searchToken = "WS301"; // Texto para buscar dispositivos

    const devEui = await findDeviceDevEui(apiKey, appId, searchToken);
    console.log(`✅ DevEui encontrado: ${devEui}`);
 ----------------------------crear perfil device----------------------------   
    const profileId = await createDevProfileId(chirpstack_api_token, chirpstack_tenant_id, "B", "AU915");
    console.log("Perfil de dispositivo creado con ID:", profileId);
-----------------------------crear application------------------------------
    const testJson = `{
        "command": "create_application",
        "data": {
            "tenant_id ": "52f14cd4-c6f1-4fbd-8f87-4025e1d49242",
            "name": "TLAB1",
            "description": "pruebita"
        }
    }`;  
-----------------------------eliminar application------------------------------
    const testJson = `{
        "command": "delete_application",
        "data": {
            "apiKey ": "52f14cd4-c6f1-4fbd-8f87-4025e1d49242",
            "applicationId": "xxxxxxxxxxxxxxxxx"
        }
    }`;  
 -----------------------------listar apps-----------------------------   
    const applications = await getApplicationList(chirpstack_api_token, chirpstack_tenant_id);
    console.log("Lista de aplicaciones:", applications);
---------------------------eliminar aps------------------------------ 
    deleteApplication(chirpstack_api_token, "918ced17-a47c-4f56-999e-952a21bfd8c2") 
    
    updateDeviceProfile(apiKey, "c78cad92-2ac8-43da-9e10-ad3449ed5b6f", {name: "Class-A"}).then(console.log).catch(console.error);

    deleteDeviceProfile(apiKey, "c78cad92-2ac8-43da-9e10-ad3449ed5b6f")

    commands_parse(testJson);
*/
    const testJson = `{
        "command": "create_device",
        "data": {
            "device_name": "AM103L",
            "description": "Sensor de temperatura",
            "lorawan_metadata": {
                "DevEui": "24E124725E032608",
                "DevClass": "A",
                "JoinEui": "24E124C0002A0001",
                "AppKey": "5572404C696E6B4C6F52613230313823"
            }
        }
    }`;    
    commands_parse(testJson); 
}

main();
