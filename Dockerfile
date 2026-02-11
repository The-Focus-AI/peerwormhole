FROM node:22-bookworm-slim

WORKDIR /workspace

COPY "./" "./"
RUN npm install
CMD ["npm", "run", "start"]