const mysql = require('mysql2/promise');

async function addOrgaoColumn() {
  const conn = await mysql.createConnection({
    host: 'seget_agend.mysql.dbaas.com.br',
    port: 3306,
    user: 'seget_agend',
    password: 'tR4R3DGatrj4u@',
    database: 'seget_agend'
  });

  try {
    // Verifica se a coluna já existe
    const [columns] = await conn.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'seget_agend' 
      AND TABLE_NAME = 'external_participants' 
      AND COLUMN_NAME = 'orgao'
    `);

    if (columns.length === 0) {
      console.log('Adicionando coluna orgao...');
      await conn.execute('ALTER TABLE external_participants ADD COLUMN orgao VARCHAR(100) NULL');
      console.log('✓ Coluna orgao criada com sucesso!');
    } else {
      console.log('✓ Coluna orgao já existe no banco de dados.');
    }
  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await conn.end();
  }
}

addOrgaoColumn();
