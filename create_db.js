const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('chirpstack.db', (err) => {
    if (err) {
        console.error("❌ Error al abrir la base de datos:", err.message);
    } else {
        console.log("✅ Base de datos SQLite creada con éxito.");

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
            } else {
                console.log("✅ Tabla 'device_data' lista.");
            }
        });
    }
});

// Cierra la conexión después de un tiempo (para evitar problemas si se usa en scripts)
setTimeout(() => db.close(), 1000);
