// mqtt_publisher.js
function publishMessage(client, topic, message) {
    try {
        client.publish(topic, message, (err) => {
            if (err) {
                console.error(`Error al publicar en el topic ${topic}:`, err);
            } else {
                console.log(`Mensaje publicado en ${topic}`);
            }
        });
    } catch (error) {
        console.error('Error en la publicación del mensaje:', error);
    }
}

module.exports = publishMessage;
