# Используйте Node.js образ
FROM node:20

# Установите рабочую директорию
WORKDIR /usr/src/app

# Скопируйте package.json и package-lock.json
COPY package*.json ./

# Установите зависимости
RUN npm install

# Скопируйте все файлы в контейнер
COPY . .

# Запустите приложение
CMD ["npm", "start"]
