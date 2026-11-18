package com.hudayouju.hudayouju.common;

public class Result<T> {
    private Integer code;
    private String message;
    private T data;

    public Result(Integer code, String message, T data) {
        this.code = code;
        this.message = message;
        this.data = data;
    }

    // 业务成功：code 必须是 0
    public static <T> Result<T> success(T data) {
        return new Result<>(0, "success", data);
    }

    // 业务失败：code 必须是非 0（比如 400, 403, 409）
    public static <T> Result<T> error(Integer code, String message) {
        return new Result<>(code, message, null);
    }

    public Integer getCode() { return code; }
    public void setCode(Integer code) { this.code = code; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
    public T getData() { return data; }
    public void setData(T data) { this.data = data; }
}