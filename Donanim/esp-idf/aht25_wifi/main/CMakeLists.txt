idf_component_register(SRCS "main.c"
                       PRIV_REQUIRES esp_driver_i2c esp_driver_gpio esp_wifi esp_http_client nvs_flash esp_netif esp_event
                       INCLUDE_DIRS ".")
