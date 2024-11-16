FROM node:21-alpine3.18

WORKDIR /app

COPY . .

RUN npm install

WORKDIR /app/src/db
RUN npx prisma migrate dev --name init

EXPOSE 3000

CMD ["npm", "run", "dev"]