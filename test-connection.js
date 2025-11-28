const mysql = require('mysql2');
require('dotenv').config();

console.log('🔍 Testando conexão com o banco de dados...\n');
console.log('Configurações:');
console.log(`Host: ${process.env.DB_HOST}`);
console.log(`Port: ${process.env.DB_PORT}`);
console.log(`Username: ${process.env.DB_USERNAME}`);
console.log(`Database: ${process.env.DB_DATABASE}\n`);

const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    connectTimeout: 60000, // 60 segundos
});

connection.connect((err) => {
    if (err) {
        console.error('❌ Erro ao conectar ao banco de dados:');
        console.error(err.message);
        console.error('\nPossíveis causas:');
        console.error('1. Servidor de banco de dados está offline');
        console.error('2. Credenciais incorretas');
        console.error('3. Firewall bloqueando a conexão');
        console.error('4. IP não está na whitelist do servidor');
        process.exit(1);
    }

    console.log('✅ Conexão estabelecida com sucesso!');
    console.log(`📊 Thread ID: ${connection.threadId}\n`);

    // Testa uma query simples
    connection.query('SELECT 1 + 1 AS result', (error, results) => {
        if (error) {
            console.error('❌ Erro ao executar query:', error.message);
            connection.end();
            process.exit(1);
        }

        console.log('✅ Query executada com sucesso!');
        console.log(`Resultado: 1 + 1 = ${results[0].result}`);

        connection.end((endErr) => {
            if (endErr) {
                console.error('❌ Erro ao fechar conexão:', endErr.message);
                process.exit(1);
            }
            console.log('\n✅ Conexão fechada corretamente');
            console.log('🎉 Teste de conexão concluído com sucesso!');
            process.exit(0);
        });
    });
});

// Timeout de segurança
setTimeout(() => {
    console.error('\n⏱️ Timeout: Não foi possível conectar em 60 segundos');
    console.error('Verifique sua conexão de internet e as configurações do servidor');
    process.exit(1);
}, 65000);
