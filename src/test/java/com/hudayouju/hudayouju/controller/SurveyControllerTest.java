package com.hudayouju.hudayouju.controller;

import com.hudayouju.hudayouju.common.Result;
import com.hudayouju.hudayouju.model.User;
import com.hudayouju.hudayouju.repository.PointLedgerRepository;
import com.hudayouju.hudayouju.repository.ResponseRepository;
import com.hudayouju.hudayouju.repository.SurveyRepository;
import com.hudayouju.hudayouju.repository.UserRepository;
import com.hudayouju.hudayouju.service.SurveyService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SurveyControllerTest {

    @Mock private SurveyRepository surveyRepository;
    @Mock private UserRepository userRepository;
    @Mock private PointLedgerRepository pointLedgerRepository;
    @Mock private ResponseRepository responseRepository;
    @Mock private SurveyService surveyService;

    private SurveyController controller;

    @BeforeEach
    void setUp() {
        controller = new SurveyController(surveyRepository, userRepository, pointLedgerRepository,
                responseRepository, surveyService);

        User user = new User();
        user.setId(7L);
        when(userRepository.findByOpenid("openid-1")).thenReturn(Optional.of(user));
    }

    @Test
    void negativeTimeSpentSecondsIsRejectedBeforeServiceCall() {
        Map<String, Object> body = new HashMap<>();
        body.put("answers", "[0,1,0,1]");
        body.put("timeSpentSeconds", -10);

        Result<Object> result = controller.submit(1L, body, "openid-1");

        assertEquals(400, result.getCode());
        assertTrue(result.getMessage().contains("timeSpentSeconds"));
        verify(surveyService, never()).submitSurvey(anyLong(), anyLong(), any(), anyString());
    }

    @Test
    void nonNumericTimeSpentSecondsIsRejected() {
        Map<String, Object> body = new HashMap<>();
        body.put("answers", "[0,1,0,1]");
        body.put("timeSpentSeconds", "abc");

        Result<Object> result = controller.submit(1L, body, "openid-1");

        assertEquals(400, result.getCode());
        verify(surveyService, never()).submitSurvey(anyLong(), anyLong(), any(), anyString());
    }

    @Test
    void validTimeSpentSecondsIsForwarded() {
        Map<String, Object> body = new HashMap<>();
        body.put("answers", "[0,1,0,1]");
        body.put("timeSpentSeconds", 30);
        when(surveyService.submitSurvey(1L, 7L, 30L, "[0,1,0,1]"))
                .thenReturn(Result.success("提交成功！获得 5 积分 / 5 信誉"));

        Result<Object> result = controller.submit(1L, body, "openid-1");

        assertEquals(0, result.getCode());
        verify(surveyService).submitSurvey(1L, 7L, 30L, "[0,1,0,1]");
    }

    @Test
    void legacyMisspelledFieldIsStillRead() {
        Map<String, Object> body = new HashMap<>();
        body.put("answers", "[0,1,0,1]");
        // 早期调用方把字段写成了 timeSpendSeconds
        body.put("timeSpendSeconds", -10);

        Result<Object> result = controller.submit(1L, body, "openid-1");

        assertEquals(400, result.getCode());
        verify(surveyService, never()).submitSurvey(anyLong(), anyLong(), any(), anyString());
    }
}
