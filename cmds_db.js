const sqlite3 = require('sqlite3').verbose();

function connectDb(){
    const db = new sqlite3.Database('chirpstack.db', (err) => {
        if (err) {
            console.error("Error al abrir la base de datos:", err.message);
        } else {
            console.log("Conectado a la base de datos SQLite.");
        }
    });
    return db;
}

function saveSQLite(devEui, datetime, payload, published) {
    const db = connectDb();
    const insertQuery = `INSERT INTO device_data (deveui, datetime, payload, done) VALUES (?, ?, ?, ?)`;

    db.run(insertQuery, [devEui, datetime, payload, published], (err) => {
        if (err) {
            console.error("Error al insertar en la base de datos:", err.message);
        } else {
            console.log("Datos guardados en SQLite.");
        }
    });
}

function deleteAllData() {
    const db = connectDb();
    const deleteQuery = `DELETE FROM device_data`;

    db.run(deleteQuery, (err) => {
        if (err) {
            console.error("Error al borrar todos los datos:", err.message);
        } else {
            console.log("Todos los datos han sido eliminados de SQLite.");
        }
    });
}

function getAllData() {
    const db = connectDb();
    const selectQuery = `SELECT * FROM device_data`;

    db.all(selectQuery, [], (err, rows) => {
        if (err) {
            console.error("❌ Error al recuperar datos:", err.message);
        } else {
            console.log("📌 Datos en la tabla device_data:");
            console.table(rows);
        }
        db.close();
    });
}

function getUnpublishedMessages() {
    return new Promise((resolve, reject) => {
        const db = connectDb();
        const selectQuery = `SELECT deveui, datetime, payload FROM device_data WHERE done = 0`;

        db.all(selectQuery, [], (err, rows) => {
            if (err) {
                console.error("❌ Error al recuperar datos:", err.message);
                reject(err);
            } else {
                console.log("📌 Datos con published = 0 recuperados.");
                const formattedData = rows.map(row => ({
                    deveui: row.deveui,
                    datetime: row.datetime,
                    payload: row.payload // Asegúrate de que el payload esté en formato correcto
                }));
                console.log(formattedData);
                resolve(formattedData);
            }
            db.close();
        });
    });
}

function deleteOldData() {
    const db = connectDb();

    const countQuery = `
        SELECT COUNT(*) AS total 
        FROM device_data 
        WHERE datetime(datetime) < datetime('now', '-1 month')
    `;

    db.get(countQuery, [], (err, row) => {
        if (err) {
            console.error("❌ Error al contar los registros a eliminar:", err.message);
            db.close();
            return;
        }

        console.log(`🔍 Registros a eliminar: ${row.total}`);

        if (row.total > 0) {
            const deleteQuery = `
                DELETE FROM device_data 
                WHERE datetime(datetime) < datetime('now', '-1 month')
            `;

            db.run(deleteQuery, (err) => {
                if (err) {
                    console.error("❌ Error al borrar datos antiguos:", err.message);
                } else {
                    console.log(`🗑️ Se eliminaron ${row.total} registros antiguos.`);
                }
                db.close();
            });
        } else {
            console.log("✅ No hay registros para eliminar.");
            db.close();
        }
    });
}

async function updatePublishedStatus(deveui, datetime) {
    const db = connectDb();
    return new Promise((resolve, reject) => {
        db.run("UPDATE device_data SET done = 1 WHERE deveui = ? AND datetime = ?", [deveui, datetime], (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}



// Exportar las funciones para usarlas en otro archivo
module.exports = { connectDb, saveSQLite, updatePublishedStatus, deleteAllData, 
    getAllData, getUnpublishedMessages, deleteOldData};
