package com.hudayouju.hudayouju;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.ComponentScan;

@SpringBootApplication
@ComponentScan(basePackages = "com.hudayouju.hudayouju") // 强制扫描全包
public class HudayoujuApplication {
	public static void main(String[] args) {
		SpringApplication.run(HudayoujuApplication.class, args);
	}
}