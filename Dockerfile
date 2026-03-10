FROM node:24-bookworm-slim

WORKDIR /workspace

COPY "./" "./"
RUN npm install
CMD ["npm", "run", "start"]