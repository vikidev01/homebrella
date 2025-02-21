'use strict'

const mqtt = require('mqtt');
const fs = require('fs');
const path = require('path');

const {getApiKey, getTenantId, getApplicationId, createDevice, enqueueDevPacket, deleteDevice,
        createGateway, deleteGateway, updateGateway, createApplication, deleteApplication} = require('./chirpstack_cmds');
const { saveSQLite, deleteOldData, getUnpublishedMessages, updatePublishedStatus} = require('./database');

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
let reconnect_count = 0;
let reconnect_delay = FIRST_RECONNECT_DELAY;

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


const BACKUP_DEVICES_TOPIC = "backup/topic"
const backup_broker = 'mqtt://test.mosquitto.org:1883';
const backup_mqtt_client = mqtt.connect(backup_broker);
// =========================== Functions ============================= //

// ------------------------- Parse Commands -------------------------- //
function commands_parse(jsonStr) {
    try {
        const jsonDict = JSON.parse(jsonStr);
        const { command, data } = jsonDict;
    
        // Mapeo de comandos a funciones
        const commandMap = {
            "create_device": () => {
                const lorawanMetadata = data.lorawan_metadata;
                console.log("Create command received");
                const { device_name: devName, description: devDescr, DevEui: devEui, DevClass: devClass, JoinEui: devJoinEui, AppKey: devAppKey } = lorawanMetadata;
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
                    console.log("Respuesta:", resp);
                    return resp;
                } catch (e) {
                    console.error("create_device -> Error", e);
                    return 0;
                }
            },
            "enqueue_packet": () => {
                console.log("Enqueue command received");
                const lorawanMetadata = data.lorawan_metadata;
                const { DevEui: devEui, port, confirmed } = lorawanMetadata;
                try {
                    const resp = enqueueDevPacket(
                        chirpstack_api_token,
                        chirpstack_tenant_id,
                        chirpstack_app_id,
                        devEui,
                        port,
                        confirmed === "True",
                        data.payload
                    );
                    return resp;
                } catch (e) {
                    console.error("enqueue_packet -> Error", e);
                    return 0;
                }
            },
            "delete_device": () => {
                console.log("Command received -> delete_device");
                const lorawanMetadata = data.lorawan_metadata;
                try {
                    const resp = deleteDevice(chirpstack_api_token, lorawanMetadata.DevEui);
                    return resp;
                } catch (e) {
                    console.error("delete_device -> Error", e);
                    return 0;
                }
            },
            "create_gateway": () => {
                console.log("Command received -> create_gateway");
                const { gateway_id: gId, name: gName, description: gDescr } = data;
                try {
                    const resp = createGateway(chirpstack_api_token, gId, gName, gDescr);
                    return resp;
                } catch (e) {
                    console.error("create_gateway -> Error", e);
                    return 0;
                }
            },
            "delete_gateway": () => {
                console.log("Command received -> delete_gateway");
                try {
                    const resp = deleteGateway(data.gateway_id);
                    return resp;
                } catch (e) {
                    console.error("delete_gateway -> Error", e);
                    return 0;
                }
            },
            "update_gateway": () => {
                console.log("Command received -> update_gateway");
                const { gateway_id: gId, name: gName, description: gDescr } = data;
                try {
                    const resp = updateGateway(chirpstack_api_token, gId, gName, gDescr);
                    return resp;
                } catch (e) {
                    console.error("update_gateway -> Error", e);
                    return 0;
                }
            },
            "create_application": () => {
                console.log("Command received -> create_application");
                const { apiKey: appKey, tenantId: appTenant, name: appName, description: appDescr } = data;
                try {
                    const resp = createApplication(appTenant, appName, appDescr);
                    return resp;
                } catch (e) {
                    console.error("create_application -> Error", e);
                    return 0;
                }
            },
            "delete_application": () => {
                console.log("Command received -> delete_application");
                const { apiKey: appKey, applicationId: appId } = data;
                try {
                    const resp = deleteApplication(appKey, appId);
                    return resp;
                } catch (e) {
                    console.error("delete_application -> Error", e);
                    return 0;
                }
            }
        };

        // Si el comando existe en el mapa, ejecuta la función correspondiente
        if (commandMap[command]) {
            return commandMap[command]();
        } else {
            console.log("Comando desconocido");
            return 2; // Comando no reconocido
        }
    } catch (e) {
        console.error("Error al parsear JSON o ejecutar comando", e);
        return 2; // Error en el parseo o ejecución del comando
    }
}

// ============================ Amazon MQTT Functions ============================ //

async function publishPendingMessages() {
    try {
        const pendingMessages = await getUnpublishedMessages(); // Obtener tramas no publicadas
        for (const msg of pendingMessages) {
            const jsonMessage = JSON.stringify({
                deveui: msg.deveui,
                payload: msg.payload,
                datetime: msg.datetime
            });
            // Intentar publicar en el tópico principal
            amazon_mqtt_client.publish(AMAZON_DEVICES_TOPIC, jsonMessage, async (err) => {
                if (!err) {
                    await updatePublishedStatus(msg.deveui, msg.datetime); // Marcar como publicado en la DB
                } else {
                    console.error("Error publicando en el tópico principal:", err);
                    
                    // Si no se puede publicar, intentar en el backup
                    try {
                        backup_mqtt_client.publish(BACKUP_DEVICES_TOPIC, jsonMessage, async (backupErr) => {
                            if (backupErr) {
                                console.error("Error publicando en el backup:", backupErr);
                            } else {
                                await updatePublishedStatus(msg.deveui, msg.datetime); // Marcar como publicado en la DB
                            }
                        });
                    } catch (backupError) {
                        console.error("Error al conectar con el broker de respaldo:", backupError);
                    }
                }
            });
        }
    } catch (error) {
        console.error("Error al publicar mensajes pendientes:", error);
    }
}

// Evento de conexión
function amazon_on_connect() {
    console.log("Conectado a Amazon MQTT Broker---------------------------");
    subscribeToCommands();
    amazon_mqtt_client.publish(AMAZON_EVENTS_TOPIC, "LNS Connected!", (err) => {
        if (err) {
            console.error("❌ Error publicando 'LNS Connected!':", err);
        } else {
            console.log("✅ Mensaje 'LNS Connected!' publicado con éxito");
        }
    });
    // Ejecutar cada 24 hs
    setInterval(publishPendingMessages, 24 * 60 * 60 * 1000); // reenvía mensajes que no fueron publicados
}

// Evento de desconexión
function amazon_on_disconnect() {
    console.log("Desconectado del Amazon MQTT Broker");
    reconnect_count++;
    retry_connection(); 
}

// Reconexión automáticaf
function retry_connection() {
    if (reconnect_count >= MAX_RECONNECT_COUNT) {
        console.log("Se alcanzó el límite de reconexiones. Salir...");
        return;
    }
    
    console.log(`Reintentando la conexión en ${reconnect_delay} segundos...`);
    setTimeout(() => {
        try {
            amazon_mqtt_client.reconnect();
            console.log("Reconexión exitosa!");
        } catch (err) {
            console.error("Fallo en la reconexión. Reintentando...", err);
            reconnect_delay = Math.min(reconnect_delay * RECONNECT_RATE, MAX_RECONNECT_DELAY);
            retry_connection();
        }
    }, reconnect_delay * 1000);
}

// Procesamiento de mensajes
function amazon_on_message(topic, message) {
    console.log(`Mensaje recibido desde ${topic}: ${message.toString()}`);
    const stat = commands_parse(message.toString());
    if (amazon_mqtt_client.connected) {
        let response = (stat === 1) ? "OK" : "ERROR";
        console.log(`Respuesta del comando: ${response}`);
        amazon_mqtt_client.publish(AMAZON_COMMANDS_TOPIC, response);
    }
}

// Función de suscripción
function subscribeToCommands() {
    amazon_mqtt_client.subscribe(AMAZON_COMMANDS_TOPIC, (err) => {
        if (err) {
            console.error(`Error al suscribirse al topic: ${AMAZON_COMMANDS_TOPIC}`);
        } else {
            console.log(`Suscrito a ${AMAZON_COMMANDS_TOPIC}`);
        }
    });
}

// Conexión MQTT
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
        console.error("Error en MQTT:", err);
    });

    
}

// ============================ Chirpstack MQTT Functions ============================ //
function chirpstack_on_message(topic, message) {
    try {
        const json_dict = JSON.parse(message.toString());
        const device = json_dict.deviceInfo?.deviceName || "";
        const time = json_dict.time || "";
        const devEui = json_dict.deviceInfo?.devEui || "";
        const encoded_data = json_dict.data;

        const rxInfo = json_dict.rxInfo;
        const lns_dict = { lns: { id: rxInfo[0].gatewayId } };
        const new_dict = { payload: { nsproduct: 'CHIRPSTACK', data: json_dict } };

        let published = 0; // Por defecto, no publicado

        const methods = {
            amazon: (message) => {
                amazon_mqtt_client.publish(AMAZON_DEVICES_TOPIC, message.toString(), (err) => {
                    if (err) {
                        console.error(`Error publicando en ${AMAZON_DEVICES_TOPIC}:`, err);
                        // Intentar el método de respaldo
                        methods.backup(message);
                    } else {
                        console.log(`Publicado en ${AMAZON_DEVICES_TOPIC}.`);
                        published = 1;
                    }
                    
                });
            },
            backup: (message) => {
                if (backup_mqtt_client.connected) {
                    backup_mqtt_client.publish(BACKUP_DEVICES_TOPIC, message.toString(), (err) => {
                        if (err) {
                            console.error(`Error publicando en respaldo ${BACKUP_DEVICES_TOPIC}:`, err);
                        } else {
                            console.log(`Publicado en respaldo ${BACKUP_DEVICES_TOPIC}.`);
                            published = 1;
                        }
                    });
                } else {
                    console.error("No conectado al broker de respaldo, no se puede publicar.");
                }
            }
        };

        if (topic === HOMEBRELLA_EVENTS_TOPIC) {
            console.log("New Homebrella Event!");
            methods.amazon(message);//publicar en AMAZON_EVENTS_TOPIC, 
        } else {
            console.log("New uplink received!");
            Object.assign(lns_dict, new_dict);
            methods.amazon(JSON.stringify(lns_dict));
        }
        // Guardar en la base de datos después de intentar publicar
        saveSQLite(devEui, time, encoded_data, published);

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
    // Ejecutar cada 24 horas
    setInterval(deleteOldData, 24 * 60 * 60 * 1000); // Elimina datos de 1 mes

    chirpstack_api_token = await getApiKey();
    chirpstack_tenant_id = await getTenantId(chirpstack_api_token);
    chirpstack_app_id = await getApplicationId(chirpstack_api_token, chirpstack_tenant_id);

    console.log("Iniciando conexión...");
    amazon_connect_mqtt();
    //amazon_mqtt_client.end(); //simula desconexion done=0
    await chirpstack_connect_mqtt();

    
}

main();
