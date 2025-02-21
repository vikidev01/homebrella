const fs = require('fs');
const execSync = require('child_process').execSync;
const grpc = require('@grpc/grpc-js');

const application_pb = require('@chirpstack/chirpstack-api/api/application_pb');
const application_grpc_pb = require('@chirpstack/chirpstack-api/api/application_grpc_pb');
const device_pb = require('@chirpstack/chirpstack-api/api/device_pb');
const device_grpc_pb = require('@chirpstack/chirpstack-api/api/device_grpc_pb');
const device_profile_pb = require('@chirpstack/chirpstack-api/api/device_profile_pb');
const device_profile_grpc_pb = require('@chirpstack/chirpstack-api/api/device_profile_grpc_pb');
const gateway_pb = require('@chirpstack/chirpstack-api/api/gateway_pb');
const gateway_grpc_pb = require('@chirpstack/chirpstack-api/api/gateway_grpc_pb');
const tenant_pb = require('@chirpstack/chirpstack-api/api/tenant_pb');
const tenant_grpc_pb = require('@chirpstack/chirpstack-api/api/tenant_grpc_pb');


const server = "127.0.0.1:8080";

const lora_regions = {
    "EU868": 0,
    "US915": 2,
    "CN779": 3,
    "EU433": 4,
    "AU915": 5,
    "CN470": 6,
    "AS923": 7,
    "AS923_2": 12,
    "AS923_3": 13,
    "AS923_4": 14,
    "KR920": 8,
    "IN865": 9,
    "RU864": 10,
    "ISM2400": 11    
  };

function getApiKey() {
    try {
        const apiKeyPath = './api_key.txt';
        if (fs.existsSync(apiKeyPath)) {
            const apiKey = fs.readFileSync(apiKeyPath, 'utf-8').trim();
            return apiKey;
        } else {
            const result = execSync('sudo chirpstack --config /etc/chirpstack create-api-key --name cli_api_key');
            const apiKey = result.toString();
            const tokenIndex = apiKey.indexOf('token: ') + 7;
            const token = apiKey.substring(tokenIndex).trim();
            fs.writeFileSync('api_key.txt', token);
            return token;
            }
    } catch (error) {
        console.error('Error al obtener la API Key:', error);
        throw error;
    }
}
async function getTenantId(apiKey) {
    const credentials = grpc.credentials.createInsecure();
    const client = new tenant_grpc_pb.TenantServiceClient(server, credentials);
    const metadata = new grpc.Metadata();
    metadata.add('authorization', `Bearer ${apiKey}`);

    const request = new tenant_pb.ListTenantsRequest();
    request.setLimit(5);
    request.setOffset(0);

    return new Promise((resolve, reject) => {
        client.list(request, metadata, (error, response) => {
            if (error) {
                console.error('Error al obtener el Tenant ID:', error);
                return reject(error);
            }
            const tenantData = response.u[1][0];  // Accedemos al primer tenant en el array
            const tenantId = tenantData[0];  // El tenant ID parece estar en la primera posición
            resolve(tenantId);
        });
    });
}

async function getApplicationId(apiKey, tenantId) {
    const credentials = grpc.credentials.createInsecure();
    const client = new application_grpc_pb.ApplicationServiceClient(server,credentials);

    const metadata = new grpc.Metadata();
    metadata.add('authorization', `Bearer ${apiKey}`);

    const request = new application_pb.ListApplicationsRequest();
    request.setLimit(5);
    request.setOffset(0);
    request.setTenantId(tenantId);

    return new Promise((resolve, reject) => {
        client.list(request, metadata, (error, response) => {
            if (error) {
                console.error('Error al obtener el Application ID:', error);
                return reject(error);
            }

            const applicationId = response.getResultList()[0].getId();
            resolve(applicationId);
        });
    });
}
//------------------------ DEVICES / PROFILES ---------------------
async function getDevProfileId(apiKey, tenantId, devClass) {
    try {
        apiKey = await getApiKey();
        tenantId = await getTenantId(apiKey);

        const credentials = grpc.credentials.createInsecure();
        const client = new device_profile_grpc_pb.DeviceProfileServiceClient(server, credentials);
        
        const metadata = new grpc.Metadata();
        metadata.add('authorization', `Bearer ${apiKey}`);

        const request = new device_profile_pb.ListDeviceProfilesRequest();
        request.setLimit(5);
        request.setOffset(0);  
        request.setTenantId(tenantId);
        request.setSearch(`Class-${devClass}`);
    
        return new Promise((resolve, reject) => {
            
            client.list(request, metadata, (error, response) => {
                if (error) {
                    console.error('Error al obtener el Device Profile ID:', error);
                    return reject(error);
                }
                try {
                    const resultList = response.getResultList();
                    if (resultList.length === 0) {
                        return reject('No se encontraron perfiles de dispositivo.');
                    }
                    const profileId = resultList[0].getId();  // Aquí obtienes el ID
                    resolve(profileId);  // Resuelves la promesa con el profileId

                } catch (err) {
                    reject(err);
                }

            });
        });
    }catch (error) {
        console.error('Error en getDevProfileId:', error);
        throw error;
    }
}

async function createDevice(apiKey, tenantId, appId, devEui, devName, devDescrip, devClass, joinEui, appKey) {
    apiKey = await getApiKey();
    tenantId = await getTenantId(apiKey);
    appId = await getApplicationId(apiKey, tenantId);

    const credentials = grpc.credentials.createInsecure();
    const client = new device_grpc_pb.DeviceServiceClient(server, credentials);

    const metadata = new grpc.Metadata();
    metadata.add('authorization', `Bearer ${apiKey}`);

    const deviceRequest = new device_pb.CreateDeviceRequest();
    const device = new device_pb.Device();
    
    device.setDevEui(devEui);
    device.setName(devName);
    device.setDescription(devDescrip);
    device.setApplicationId(appId);
    device.setDeviceProfileId(await getDevProfileId(apiKey, tenantId, devClass));
    device.setSkipFcntCheck(false);
    device.setIsDisabled(false);
    device.setJoinEui(joinEui);

    deviceRequest.setDevice(device);
    
    const deviceKeysRequest = new device_pb.CreateDeviceKeysRequest();
    const deviceKeys = new device_pb.DeviceKeys();

    deviceKeys.setDevEui(devEui);
    deviceKeys.setNwkKey(appKey);
    deviceKeys.setAppKey("");

    deviceKeysRequest.setDeviceKeys(deviceKeys);
    
    return new Promise((resolve, reject) => {
        client.create(deviceRequest, metadata, (error, response) => {

            if (error) {
                console.error("Error al crear el dispositivo:", error);
                return reject(0);
            }
            client.createKeys(deviceKeysRequest, metadata, (error, response) => {
                if (error) {
                    console.error("Error al crear las claves del dispositivo:", error);
                    return reject(0);
                }
                console.log(`Device with DevEui ${devEui} created`);
                resolve(1);
            });
        });
    });
}

async function createDevProfileId(apiKey, tenantId, devClass, devRegion) {
    apiKey = await getApiKey();
    tenantId = await getTenantId(apiKey);

    const credentials = grpc.credentials.createInsecure();
    const client = new device_profile_grpc_pb.DeviceProfileServiceClient(server, credentials);

    const metadata = new grpc.Metadata();
    metadata.add('authorization', `Bearer ${apiKey}`);

    const deviceProfileRequest = new device_profile_pb.CreateDeviceProfileRequest();
    const deviceProfile = new device_profile_pb.DeviceProfile();

    deviceProfile.setTenantId(tenantId);
    deviceProfile.setName(`Class-${devClass}`);
    deviceProfile.setDescription(`Profile for Class-${devClass} devices`);
    deviceProfile.setRegion(lora_regions[devRegion]);  // AU915 = 5
    deviceProfile.setMacVersion(3); // LORAWAN_1_0_3 = 3
    deviceProfile.setRegParamsRevision(0); // A = 0
    deviceProfile.setFlushQueueOnActivate(true);
    deviceProfile.setAdrAlgorithmId("default"); // Default ADR algorithm (LoRa only)
    deviceProfile.setSupportsOtaa(true);

    if (devClass === 'B') {
        deviceProfile.setSupportsClassB(true);
    }
    if (devClass === 'C') {
        deviceProfile.setSupportsClassC(true);
    }

    deviceProfileRequest.setDeviceProfile(deviceProfile);

    return new Promise((resolve, reject) => {
        client.create(deviceProfileRequest, metadata, (error, response) => {
            if (error) {
                console.error("Error al crear el perfil de dispositivo:", error);
                return reject(error);
            }
            console.log("Device Profile ID:", response.getId());
            resolve(response.getId());
        });
    });
}

async function updateDeviceProfile(apiKey, profileId, newSettings) {
    apiKey = await getApiKey(); 

    const credentials = grpc.credentials.createInsecure();
    const client = new device_profile_grpc_pb.DeviceProfileServiceClient(server, credentials);

    const metadata = new grpc.Metadata();
    metadata.add('authorization', `Bearer ${apiKey}`);

    const request = new device_profile_pb.UpdateDeviceProfileRequest();
    const deviceProfile = new device_profile_pb.DeviceProfile();

    deviceProfile.setId(profileId);

    // Aplicar las nuevas configuraciones al perfil de dispositivo.
    Object.keys(newSettings).forEach(key => {
        if (typeof deviceProfile[`set${key.charAt(0).toUpperCase() + key.slice(1)}`] === "function") {
            deviceProfile[`set${key.charAt(0).toUpperCase() + key.slice(1)}`](newSettings[key]);
        }
    });

    request.setDeviceProfile(deviceProfile);

    return new Promise((resolve, reject) => {
        client.update(request, metadata, (error, response) => {
            if (error) {
                console.error("Error al actualizar el perfil de dispositivo:", error);
                return reject(error);
            }
            console.log("Perfil de dispositivo actualizado correctamente.");
            resolve(response);
        });
    });
}

async function deleteDeviceProfile(apiKey, profileId) {
    apiKey = await getApiKey(); // Obtener la API Key si es necesario.

    const credentials = grpc.credentials.createInsecure();
    const client = new device_profile_grpc_pb.DeviceProfileServiceClient(server, credentials);

    const metadata = new grpc.Metadata();
    metadata.add('authorization', `Bearer ${apiKey}`);

    const request = new device_profile_pb.DeleteDeviceProfileRequest();
    request.setId(profileId);

    return new Promise((resolve, reject) => {
        client.delete(request, metadata, (error, response) => {
            if (error) {
                console.error("Error al eliminar el perfil de dispositivo:", error);
                return reject(error);
            }
            console.log("Perfil de dispositivo eliminado correctamente.");
            resolve(response);
        });
    });
}

async function enqueueDevPacket(apiKey, tenantId, appId, devEui, port, confirmed, payload) {
    apiKey = await getApiKey();

    const credentials = grpc.credentials.createInsecure();
    const client = new device_grpc_pb.DeviceServiceClient(server, credentials);

    const request = new device_pb.EnqueueDeviceQueueItemRequest();
    const queueItem = new device_pb.DeviceQueueItem();

    queueItem.setConfirmed(confirmed);
    queueItem.setData(Buffer.from(payload, 'hex'));
    queueItem.setDevEui(devEui);
    queueItem.setFPort(port);

    request.setQueueItem(queueItem);

    return new Promise((resolve, reject) => {
        const metadata = new grpc.Metadata();
        metadata.add('authorization', `Bearer ${apiKey}`);
        client.enqueue(request, metadata , (error, response) => {
            if (error) {
                console.error("Error encolando paquete:", error);
                return reject(0);
            }
            resolve(1);
        });
    });
}

async function findDeviceDevEui(apiKey, appId, searchToken) {
    apiKey = await getApiKey();

    const credentials = grpc.credentials.createInsecure();
    const client = new device_grpc_pb.DeviceServiceClient(server, credentials);

    const request = new device_pb.ListDevicesRequest();
    request.setSearch(searchToken);
    request.setApplicationId(appId);
    request.setOffset(0);
    request.setLimit(10);

    return new Promise((resolve, reject) => {
        const metadata = new grpc.Metadata();
        metadata.add('authorization', `Bearer ${apiKey}`);
        client.list(request, metadata, (error, response) => {
            if (error) {
                console.error("Error buscando dispositivo:", error);
                return reject(0);
            }
            const result = response.getResultList();
            if (result.length > 0) {
                console.log(result[0].getDevEui());
                resolve(result[0].getDevEui());
            } else {
                resolve(0);
            }
        });
    });
}

async function deleteDevice(apiKey, devEui) {
    apiKey = await getApiKey();

    const credentials = grpc.credentials.createInsecure();
    const client = new device_grpc_pb.DeviceServiceClient(server, credentials);


    const request = new device_pb.DeleteDeviceRequest();
    request.setDevEui(devEui);

    return new Promise((resolve, reject) => {
        const metadata = new grpc.Metadata();
        metadata.add('authorization', `Bearer ${apiKey}`);
        client.delete(request, metadata, (error, response) => {
            if (error) {
                console.error("Error eliminando dispositivo:", error);
                return reject(0);
            }
            console.log("Se ha eliminado el dispositivo");
            resolve(1);
            
        });
    });
}
/*
async function activateDeviceRequest(apiKey, devEui, devAddr, appSKey, nwkSEncKey, sNwkSIntKey, fNwkSIntKey) {
    apiKey = await getApiKey();
    const request = new device_pb.ActivateDeviceRequest();
    const deviceActivation = new device_pb.DeviceActivation();

    const credentials = grpc.credentials.createInsecure();
    const client = new device_grpc_pb.DeviceServiceClient(server, credentials);

    deviceActivation.setDevEui(devEui);
    deviceActivation.setDevAddr(devAddr);
    deviceActivation.setAppSKey(appSKey);
    deviceActivation.setNwkSEncKey(nwkSEncKey);
    deviceActivation.setSNwkSIntKey(sNwkSIntKey);
    deviceActivation.setFNwkSIntKey(fNwkSIntKey);

    request.setDeviceActivation(deviceActivation);

    return new Promise((resolve, reject) => {
        const metadata = new grpc.Metadata();
        metadata.add('authorization', `Bearer ${apiKey}`);
        client.activate(request, metadata, (error, response) => {
            if (error) {
                console.error("Error activando dispositivo:", error);
                return reject(0);
            }
            console.log("Activation OK!");
            resolve(1);
        });
    });
}

async function deactivateDeviceRequest(apiKey, devEui) {
    if (apiKey== " "){
        apiKey = await getApiKey();
    }
    const request = new device_pb.DeactivateDeviceRequest();
    request.setDevEui(devEui);

    return new Promise((resolve, reject) => {
        const metadata = new grpc.Metadata();
        metadata.add('authorization', `Bearer ${apiKey}`);
        client.deactivate(request, metadata, (error, response) => {
            if (error) {
                console.error("Error desactivando dispositivo:", error);
                return reject(0);
            }
            console.log("Deactivation OK!");
            resolve(1);
        });
    });
}
*/
//---------------------- GATEWAYS --------------------------------
async function getGatewayById(apiKey, gatewayId) {
    apiKey = await getApiKey(); // Obtener la API Key si es necesario.

    const credentials = grpc.credentials.createInsecure();
    const client = new gateway_grpc_pb.GatewayServiceClient(server, credentials);

    const metadata = new grpc.Metadata();
    metadata.add('authorization', `Bearer ${apiKey}`);

    const request = new gateway_pb.GetGatewayRequest();
    request.setGatewayId(gatewayId);

    return new Promise((resolve, reject) => {
        client.get(request, metadata, (error, response) => {
            if (error) {
                console.error("Error al obtener el Gateway:", error);
                return reject(error);
            }
            console.log("Gateway obtenido:", response.toObject());
            resolve(response.toObject());
        });
    });
}

async function createGateway(apiKey, gatewayId, name, description) {
    apiKey = await getApiKey();
    tenantId = await getTenantId(apiKey);

    const credentials = grpc.credentials.createInsecure();
    const client = new gateway_grpc_pb.GatewayServiceClient(server, credentials);

    const statsInterval = 30;
    const request = new gateway_pb.CreateGatewayRequest();
    const gateway = new gateway_pb.Gateway();
    
    gateway.setGatewayId(gatewayId);
    gateway.setTenantId(tenantId);
    gateway.setName(name);
    gateway.setDescription(description);
    gateway.setStatsInterval(statsInterval);
    gateway.setLocation("AU915");

    request.setGateway(gateway);
    
    return new Promise((resolve, reject) => {
        const metadata = new grpc.Metadata();
        metadata.add('authorization', `Bearer ${apiKey}`);
        
        client.create(request, metadata, (error, response) => {
            if (error) {
                console.error("Error al crear Gateway:", error);
                return reject(error);
            }
            resolve("Gateway creado exitosamente.");
        });
    });
}

async function deleteGateway(apiKey, gatewayId) {
    apiKey = await getApiKey();
    
    const credentials = grpc.credentials.createInsecure();
    const client = new gateway_grpc_pb.GatewayServiceClient(server, credentials);

    const request = new gateway_pb.DeleteGatewayRequest();
    request.setGatewayId(gatewayId);
    
    return new Promise((resolve, reject) => {
        const metadata = new grpc.Metadata();
        metadata.add('authorization', `Bearer ${apiKey}`);
        
        client.delete(request, metadata, (error, response) => {
            if (error) {
                console.error("Error al eliminar Gateway:", error);
                return reject(error);
            }
            resolve("Gateway eliminado exitosamente.");
        });
    });
}

async function getGatewayState(apiKey, gatewayId) {
    const credentials = grpc.credentials.createInsecure();
    const client = new gateway_grpc_pb.GatewayServiceClient("127.0.0.1:8080", credentials);

    const request = new gateway_pb.GetGatewayRequest();
    request.setGatewayId(gatewayId);

    return new Promise((resolve, reject) => {
        const metadata = new grpc.Metadata();
        metadata.add('authorization', `Bearer ${apiKey}`);

        client.get(request, metadata, (error, response) => {
            if (error) {
                console.error("Error obteniendo el estado del Gateway:", error);
                return reject(error);
            }

            const gateway = response.toObject();
            if (!gateway) {
                //console.log("Gateway no encontrado.");
                return resolve("NEVER_SEEN");
            }

            const lastSeenAt = gateway.lastSeenAt?.seconds || 0;
            const statsInterval = gateway.statsInterval || 30; // Por defecto 30s si no está definido
            
            const currentTime = Math.floor(Date.now() / 1000);
            let state = "NEVER_SEEN";

            if (lastSeenAt > 0) {
                const timeDiff = currentTime - lastSeenAt;
                state = timeDiff <= statsInterval * 2 ? "ONLINE" : "OFFLINE";
            }

            //console.log(`Estado del Gateway (${gatewayId}): ${state}`);
            resolve(state);
        });
    });
}

async function getGatewayList(apiKey, limit = 10, offset = 0) {
    apiKey = await getApiKey();
    const credentials = grpc.credentials.createInsecure();
    const client = new gateway_grpc_pb.GatewayServiceClient(server, credentials);

    const request = new gateway_pb.ListGatewaysRequest();
    request.setLimit(limit);
    request.setOffset(offset);

    return new Promise((resolve, reject) => {
        const metadata = new grpc.Metadata();
        metadata.add('authorization', `Bearer ${apiKey}`);

        client.list(request, metadata, (error, response) => {
            if (error) {
                console.error("Error al listar Gateways:", error);
                return reject(error);
            }

            const gateways = response.getResultList().map(gateway => ({
                id: gateway.getGatewayId(),
                name: gateway.getName(),
                description: gateway.getDescription(),
                tenantId: gateway.getTenantId()
            }));

            resolve(gateways);
        });
    });

}

async function updateGateway(apiKey, gatewayId, name, description) {
    apiKey = await getApiKey();

    const credentials = grpc.credentials.createInsecure();
    const client = new gateway_grpc_pb.GatewayServiceClient(server, credentials);

    const request = new gateway_pb.UpdateGatewayRequest();
    const gateway = new gateway_pb.Gateway();
    const statsInterval = 30;

    gateway.setGatewayId(gatewayId);
    gateway.setName(name);
    gateway.setDescription(description);
    gateway.setStatsInterval(statsInterval);
    request.setGateway(gateway);

    return new Promise((resolve, reject) => {
        const metadata = new grpc.Metadata();
        metadata.add('authorization', `Bearer ${apiKey}`);

        client.update(request, metadata, (error, response) => {
            if (error) {
                console.error("Error al actualizar Gateway:", error);
                return reject(error);
            }
            resolve("Gateway actualizado exitosamente.");
        });
    });
}

//---------------------- APPLICATIONS ------------------------------

async function createApplication(tenantId, name, description) {
    const apiKey = await getApiKey();
    tenantId = await getTenantId(apiKey);
    const credentials = grpc.credentials.createInsecure();
    const client = new application_grpc_pb.ApplicationServiceClient(server, credentials);

    const metadata = new grpc.Metadata();
    metadata.add('authorization', `Bearer ${apiKey}`);

    const applicationRequest = new application_pb.CreateApplicationRequest();
    const application = new application_pb.Application();

    application.setTenantId(tenantId);
    application.setName(name);
    application.setDescription(description);
    applicationRequest.setApplication(application);

    return new Promise((resolve, reject) => {
        client.create(applicationRequest, metadata, (error, response) => {
            if (error) {
                console.error("Error al crear la aplicación:", error);
                return reject(error);
            }
            console.log("Application ID:", response.getId());
            resolve(response.getId());
        });
    });
}

async function getApplicationList(apiKey, tenantId, limit = 10, offset = 0, search = "") {
    apiKey = await getApiKey();
    tenantId = await getTenantId(apiKey);

    const credentials = grpc.credentials.createInsecure();
    const client = new application_grpc_pb.ApplicationServiceClient(server, credentials);

    const metadata = new grpc.Metadata();
    metadata.add('authorization', `Bearer ${apiKey}`);

    const applicationRequest = new application_pb.ListApplicationsRequest();
    applicationRequest.setTenantId(tenantId);
    applicationRequest.setLimit(limit);
    applicationRequest.setOffset(offset);
    if (search) {
        applicationRequest.setSearch(search);
    }
    return new Promise((resolve, reject) => {
        client.list(applicationRequest, metadata, (error, response) => {
            if (error) {
                console.error("Error al obtener la lista de aplicaciones:", error);
                return reject(error);
            }

            const applications = response.u ? response.u[1] : [];              
            resolve(applications);
        });
    });
}

async function deleteApplication(apiKey, appId) {
    apiKey = await getApiKey();

    const credentials = grpc.credentials.createInsecure();
    const client = new application_grpc_pb.ApplicationServiceClient(server, credentials);

    const metadata = new grpc.Metadata();
    metadata.add('authorization', `Bearer ${apiKey}`);

    const deleteRequest = new application_pb.DeleteApplicationRequest();
    deleteRequest.setId(appId);

    return new Promise((resolve, reject) => {
        client.delete(deleteRequest, metadata, (error, response) => {
            if (error) {
                console.error("Error al eliminar la aplicación:", error);
                return reject(error);
            }
            console.log("Aplicación eliminada exitosamente");
            resolve("Aplicación eliminada");
        });
    });
}


// Exportar las funciones para usarlas en otro archivo
module.exports = { getApiKey, getTenantId, getApplicationId, 
    getDevProfileId, createDevice, createDevProfileId,
    updateDeviceProfile, deleteDeviceProfile,
    enqueueDevPacket, findDeviceDevEui, deleteDevice,
    //activateDeviceRequest, deactivateDeviceRequest, 
    getGatewayById, createGateway, deleteGateway, 
    getGatewayState, getGatewayList, updateGateway,
    createApplication, getApplicationList, deleteApplication};
