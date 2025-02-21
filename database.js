const sqlite3 = require('sqlite3').verbose();

function connectDb(dbFilePath = 'database.db') {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbFilePath, (err) => {
            if (err) {
                console.error("❌ Error al abrir la base de datos:", err.message);
                reject(err);
            } else {
                console.log("✅ Conectado a la base de datos SQLite.");
                initializeDatabase(db).then(() => resolve(db)).catch(reject);
            }
        });
    });
}

function initializeDatabase(db) {
    return new Promise((resolve, reject) => {
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS device_data (
                deveui TEXT NOT NULL,
                datetime TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
                payload TEXT NOT NULL,
                done INTEGER NOT NULL CHECK (done IN (0, 1))
            );
        `;

        db.run(createTableQuery, (err) => {
            if (err) {
                console.error("❌ Error al crear la tabla:", err.message);
                reject(err);
            } else {
                console.log("✅ Tabla 'device_data' lista.");
                resolve();
            }
        });
    });
}

async function saveSQLite(devEui, datetime, payload, published) {
    const db = await connectDb();
    return new Promise((resolve, reject) => {
        const query = `INSERT INTO device_data (deveui, datetime, payload, done) VALUES (?, ?, ?, ?)`;
        db.run(query, [devEui, datetime, payload, published], function (err) {
            db.close();
            if (err) {
                console.error("❌ Error al insertar en la base de datos:", err.message);
                reject(err);
            } else {
                console.log("✅ Datos guardados en SQLite.");
                resolve(this.lastID);
            }
        });
    });
}

async function getAllData() {
    const db = await connectDb();
    return new Promise((resolve, reject) => {
        const query = `SELECT * FROM device_data`;
        db.all(query, [], (err, rows) => {
            db.close();
            if (err) {
                console.error("❌ Error al recuperar datos:", err.message);
                reject(err);
            } else {
                console.log("📌 Datos en la tabla device_data:");
                console.table(rows);
                resolve(rows);
            }
        });
    });
}

async function getUnpublishedMessages() {
    const db = await connectDb();
    return new Promise((resolve, reject) => {
        const query = `SELECT deveui, datetime, payload FROM device_data WHERE done = 0`;
        db.all(query, [], (err, rows) => {
            db.close();
            if (err) {
                console.error("❌ Error al recuperar datos:", err.message);
                reject(err);
            } else {
                console.log("📌 Mensajes sin publicar recuperados.");
                resolve(rows);
            }
        });
    });
}

async function updatePublishedStatus(deveui, datetime) {
    const db = await connectDb();
    return new Promise((resolve, reject) => {
        const query = "UPDATE device_data SET done = 1 WHERE deveui = ? AND datetime = ?";
        db.run(query, [deveui, datetime], function (err) {
            db.close();
            if (err) {
                console.error("❌ Error al actualizar el estado:", err.message);
                reject(err);
            } else {
                console.log("✅ Estado actualizado.");
                resolve();
            }
        });
    });
}

async function deleteOldData() {
    const db = await connectDb();
    return new Promise((resolve, reject) => {
        const countQuery = `SELECT COUNT(*) AS total FROM device_data WHERE datetime(datetime) < datetime('now', '-1 month')`;
        db.get(countQuery, [], (err, row) => {
            if (err) {
                console.error("❌ Error al contar registros antiguos:", err.message);
                db.close();
                reject(err);
            } else {
                console.log(`🔍 Registros a eliminar: ${row.total}`);
                if (row.total > 0) {
                    const deleteQuery = `DELETE FROM device_data WHERE datetime(datetime) < datetime('now', '-1 month')`;
                    db.run(deleteQuery, function (err) {
                        db.close();
                        if (err) {
                            console.error("❌ Error al borrar datos antiguos:", err.message);
                            reject(err);
                        } else {
                            console.log(`🗑️ Se eliminaron ${row.total} registros antiguos.`);
                            resolve();
                        }
                    });
                } else {
                    console.log("✅ No hay registros antiguos para eliminar.");
                    db.close();
                    resolve();
                }
            }
        });
    });
}

async function deleteAllData() {
    const db = await connectDb();
    return new Promise((resolve, reject) => {
        const query = `DELETE FROM device_data`;
        db.run(query, function (err) {
            db.close();
            if (err) {
                console.error("❌ Error al borrar todos los datos:", err.message);
                reject(err);
            } else {
                console.log("✅ Todos los datos han sido eliminados.");
                resolve();
            }
        });
    });
}

// Exportar las funciones para usarlas en otros archivos
module.exports = { connectDb, saveSQLite, updatePublishedStatus, deleteAllData, getAllData, getUnpublishedMessages, deleteOldData };
