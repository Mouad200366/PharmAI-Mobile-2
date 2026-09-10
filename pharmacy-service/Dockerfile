FROM eclipse-temurin:21-jdk

WORKDIR /app

COPY . .

RUN chmod +x mvnw

RUN ./mvnw -DskipTests package

EXPOSE 8082

CMD ["java", "-jar", "target/pharmacy-service-0.0.1-SNAPSHOT.jar"]