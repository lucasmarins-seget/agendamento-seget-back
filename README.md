# Sistema de Agendamento

Este projeto consiste em uma plataforma de agendamento com um backend em NestJS e um frontend em React (Vite). O backend é configurado para rodar em um container Docker, enquanto o frontend pode ser executado localmente ou via Docker.

## 🚀 Estrutura do Projeto

- `agendamento-api/`: Backend construído com NestJS, TypeORM e MySQL.
- `front-agendamento/`: Frontend construído com React, TypeScript, Tailwind CSS e Shadcn/UI.

---

## 📋 Pré-requisitos

Antes de começar, você precisará ter instalado em sua máquina:
- [Node.js](https://nodejs.org/) (Recomendado v22 ou superior)
- [Docker](https://www.docker.com/)
- [NPM](https://www.npmjs.com/) ou [Bun](https://bun.sh/) (para o frontend)

---

## 🛠️ Configuração do Backend (agendamento-api)

O backend utiliza Docker para facilitar o deployment e garantir consistência de ambiente.

### 1. Variáveis de Ambiente
Crie um arquivo `.env` na pasta `agendamento-api/` com base no seguinte modelo:

```env
# Configuração do Banco de Dados MySQL
DB_HOST=seu_host_mysql
DB_PORT=3306
DB_USERNAME=seu_usuario
DB_PASSWORD=sua_senha
DB_DATABASE=seu_banco

# JWT (Segredo para autenticação)
JWT_SECRET=seu_segredo_jwt

# NodeMailer (Configuração de e-mail)
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=seu_email@gmail.com
MAIL_PASSWORD=sua_senha_de_app

# URL do Frontend (para CORS)
FRONTEND_URL=http://localhost:8080
```

### 2. Instalação e Build
Como o Dockerfile do backend realiza apenas o deploy, você deve gerar o build localmente primeiro:

```bash
cd agendamento-api
npm install
npm run build
```

### 3. Rodando com Docker
Com o build gerado, construa e execute a imagem Docker:

```bash
# Construir a imagem
docker build -t agendamento-api .

# Rodar o container
docker run -d \
  -p 3001:3001 \
  --name agendamento-api-container \
  --env-file .env \
  agendamento-api
```
O backend estará disponível em `http://localhost:3001`.

---

## 💻 Configuração do Frontend (front-agendamento)

O frontend utiliza Vite para um desenvolvimento rápido.

### 1. Variáveis de Ambiente
Crie um arquivo `.env` na pasta `front-agendamento/`:

```env
VITE_API_BASE_URL=http://localhost:3001
```

### 2. Instalação e Execução (Desenvolvimento)
Você pode usar `npm` ou `bun`:

```bash
cd front-agendamento
npm install
# ou bun install

npm run dev
```
O frontend estará disponível em `http://localhost:8080` (ou na porta indicada no terminal).

### 3. Build para Produção
Para gerar os arquivos estáticos para produção:

```bash
npm run build
```
Os arquivos serão gerados na pasta `dist/`.

### 4. Rodando com Docker (Opcional)
Se preferir rodar o frontend via Docker (com Nginx):

```bash
# Construir a imagem
docker build -t front-agendamento .

# Rodar o container
docker run -d \
  -p 8080:80 \
  --name front-agendamento-container \
  front-agendamento
```
O frontend estará disponível em `http://localhost:8080`.

---

## 📝 Scripts Disponíveis

### Backend
- `npm run start:dev`: Inicia o servidor em modo de desenvolvimento com hot-reload.
- `npm run build`: Compila o projeto para produção.
- `npm run test`: Executa os testes unitários.

### Frontend
- `npm run dev`: Inicia o servidor de desenvolvimento do Vite.
- `npm run build`: Gera o build otimizado para produção.
- `npm run lint`: Verifica erros de linting.

---

## 🐳 Docker (Resumo)

Se desejar rodar ambos via Docker, certifique-se de que o frontend aponte para a URL correta da API e que as portas estejam devidamente mapeadas.

- **Backend Port:** 3001
- **Frontend Port:** 8080 (dev) / 80 (nginx docker)
