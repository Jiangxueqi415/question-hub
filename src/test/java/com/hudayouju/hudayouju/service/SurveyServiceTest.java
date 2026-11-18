package com.hudayouju.hudayouju.service;

import com.hudayouju.hudayouju.common.Result;
import com.hudayouju.hudayouju.model.Response;
import com.hudayouju.hudayouju.model.Survey;
import com.hudayouju.hudayouju.model.User;
import com.hudayouju.hudayouju.repository.CreditLedgerRepository;
import com.hudayouju.hudayouju.repository.PointLedgerRepository;
import com.hudayouju.hudayouju.repository.ResponseRepository;
import com.hudayouju.hudayouju.repository.SurveyRepository;
import com.hudayouju.hudayouju.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SurveyServiceTest {

    @Mock private SurveyRepository surveyRepo;
    @Mock private ResponseRepository responseRepo;
    @Mock private UserRepository userRepo;
    @Mock private CreditLedgerRepository creditLedgerRepo;
    @Mock private PointLedgerRepository pointLedgerRepo;

    private SurveyService service;
    private Survey survey;
    private User user;

    private static final String FOUR_SINGLE_QUESTIONS = """
            [
              {"q":"题目1","type":"single","options":["A","B"]},
              {"q":"题目2","type":"single","options":["A","B"]},
              {"q":"题目3","type":"single","options":["A","B"]},
              {"q":"题目4","type":"single","options":["A","B"]}
            ]
            """;

    @BeforeEach
    void setUp() {
        service = new SurveyService(surveyRepo, responseRepo, userRepo, creditLedgerRepo, pointLedgerRepo);

        survey = new Survey();
        survey.setId(1L);
        survey.setOwnerId(99L);
        survey.setEndAt(LocalDateTime.now().plusDays(1));
        survey.setQuestionsJson(FOUR_SINGLE_QUESTIONS);

        user = new User();
        user.setId(7L);
        user.setPoints(10);
        user.setCredit(40);

        when(surveyRepo.findById(1L)).thenReturn(Optional.of(survey));
        when(responseRepo.findBySurveyIdAndUserId(1L, 7L)).thenReturn(Optional.empty());
        when(userRepo.findById(7L)).thenReturn(Optional.of(user));
    }

    @Test
    void partialAnswersAreRejectedAsIncomplete() {
        // 4 题只答 2 题，漏答率 50% > 20%
        Result<Object> result = service.submitSurvey(1L, 7L, 30L, "[0,null,null,1]");

        assertEquals(400, result.getCode());
        assertTrue(result.getMessage().contains("漏答 2/4"));
        assertEquals(10, user.getPoints());
        assertEquals(35, user.getCredit());

        ArgumentCaptor<Response> captor = ArgumentCaptor.forClass(Response.class);
        verify(responseRepo).save(captor.capture());
        assertEquals("incomplete", captor.getValue().getStatus());
        verify(pointLedgerRepo, never()).save(any());
    }

    @Test
    void emptyAnswerSlotsAreCountedAsMissing() {
        // 旧实现会把 [0,"",null,null] 当成非空字符串放行，这里必须按逐题核验拦截
        Result<Object> result = service.submitSurvey(1L, 7L, 30L, "[0,\"\",null,null]");

        assertEquals(400, result.getCode());
        assertTrue(result.getMessage().contains("漏答 3/4"));
        assertEquals(35, user.getCredit());
        verify(pointLedgerRepo, never()).save(any());
    }

    @Test
    void fullAnswersWithinTimeAwardPoints() {
        Result<Object> result = service.submitSurvey(1L, 7L, 30L, "[0,1,0,1]");

        assertEquals(0, result.getCode());
        assertEquals(15, user.getPoints());
        assertEquals(45, user.getCredit());

        ArgumentCaptor<Response> captor = ArgumentCaptor.forClass(Response.class);
        verify(responseRepo).save(captor.capture());
        assertEquals("valid", captor.getValue().getStatus());
        verify(pointLedgerRepo).save(any());
    }

    @Test
    void exactlyTwentyPercentMissingIsStillAllowed() {
        survey.setQuestionsJson("""
                [
                  {"q":"题目1","type":"single","options":["A","B"]},
                  {"q":"题目2","type":"single","options":["A","B"]},
                  {"q":"题目3","type":"single","options":["A","B"]},
                  {"q":"题目4","type":"single","options":["A","B"]},
                  {"q":"题目5","type":"single","options":["A","B"]}
                ]
                """);

        Result<Object> result = service.submitSurvey(1L, 7L, 30L, "[0,null,1,0,1]");

        assertEquals(0, result.getCode());
        assertEquals(15, user.getPoints());
    }

    @Test
    void negativeTimeSpentSecondsIsRejected() {        Result<Object> result = service.submitSurvey(1L, 7L, -10L, "[0,1,0,1]");

        assertEquals(400, result.getCode());
        assertTrue(result.getMessage().contains("timeSpentSeconds"));
        verify(responseRepo, never()).save(any());
        verify(pointLedgerRepo, never()).save(any());
    }

    @Test
    void straightLiningIsRejected() {
        survey.setQuestionsJson("""
                [
                  {"q":"题目1","type":"single","options":["A","B"]},
                  {"q":"题目2","type":"single","options":["A","B"]},
                  {"q":"题目3","type":"single","options":["A","B"]}
                ]
                """);

        Result<Object> result = service.submitSurvey(1L, 7L, 30L, "[0,0,0]");

        assertEquals(400, result.getCode());
        assertTrue(result.getMessage().contains("直线作答"));
        assertEquals(10, user.getPoints());
        assertEquals(40, user.getCredit());
    }

    @Test
    void missingTimerAndMissingClientTimeIsRejected() {
        Result<Object> result = service.submitSurvey(1L, 7L, null, "[0,1,0,1]");

        assertEquals(400, result.getCode());
        assertTrue(result.getMessage().contains("/start"));
        verify(responseRepo, never()).save(any());
    }

    @Test
    void letterAnswersAreAccepted() {
        Result<Object> result = service.submitSurvey(1L, 7L, 30L, "[\"A\",\"B\",\"A\",\"B\"]");

        assertEquals(0, result.getCode());
        assertEquals(15, user.getPoints());
    }

    @Test
    void punctuationOnlyOpenAnswerCountsAsMissing() {
        survey.setQuestionsJson("""
                [
                  {"q":"开放题1","type":"open","options":[]},
                  {"q":"开放题2","type":"open","options":[]}
                ]
                """);

        Result<Object> result = service.submitSurvey(1L, 7L, 30L, "[\"这是一段有效的回答\",\"！！！\"]");

        assertEquals(400, result.getCode());
        assertTrue(result.getMessage().contains("漏答 1/2"));
        verify(pointLedgerRepo, never()).save(any());
    }

    @Test
    void duplicateSubmissionStillBlocked() {
        Response existing = new Response();
        when(responseRepo.findBySurveyIdAndUserId(1L, 7L)).thenReturn(Optional.of(existing));

        Result<Object> result = service.submitSurvey(1L, 7L, 30L, "[0,1,0,1]");

        assertEquals(409, result.getCode());
        verify(responseRepo, never()).save(any());
        verify(pointLedgerRepo, never()).save(any());
    }

    @Test
    void serverTimerOverridesForgedClientTime() {
        service.startAttempt(1L, 7L);

        // 客户端谎报 60 秒，但服务端刚记录开始时间，应按"极速作答"拦截
        Result<Object> result = service.submitSurvey(1L, 7L, 60L, "[0,1,0,1]");

        assertEquals(400, result.getCode());
        assertTrue(result.getMessage().contains("用时不足"));
        assertEquals(10, user.getPoints());
        verify(pointLedgerRepo, never()).save(any());
    }

    @Test
    void emptyAnswersArePenalizedNotTreatedAsFormatError() {
        Result<Object> result = service.submitSurvey(1L, 7L, 30L, "");

        assertEquals(400, result.getCode());
        assertTrue(result.getMessage().contains("漏答 4/4"));
        assertEquals(35, user.getCredit());
        verify(pointLedgerRepo, never()).save(any());
    }

    @Test
    void answersObjectByQuestionKeyIsSupported() {
        Result<Object> result = service.submitSurvey(1L, 7L, 30L,
                "{\"q1\":0,\"q2\":1,\"q3\":0,\"q4\":1}");

        assertEquals(0, result.getCode());
        assertEquals(15, user.getPoints());
    }

    @Test
    void answersObjectMissingKeysIsIncomplete() {
        Result<Object> result = service.submitSurvey(1L, 7L, 30L, "{\"q1\":0,\"q2\":1}");

        assertEquals(400, result.getCode());
        assertTrue(result.getMessage().contains("漏答 2/4"));
        verify(pointLedgerRepo, never()).save(any());
    }

    @Test
    void malformedAnswersJsonIsRejectedWithoutPenalty() {
        Result<Object> result = service.submitSurvey(1L, 7L, 30L, "not-a-json");

        assertEquals(400, result.getCode());
        assertTrue(result.getMessage().contains("合法的 JSON"));
        assertEquals(40, user.getCredit());
        verify(responseRepo, never()).save(any());
    }

    @Test
    void outOfRangeOptionIndexOfAnsweredQuestionIsRejected() {
        // 选项越界不能算“已作答”，否则漏答会被洗白
        Result<Object> result = service.submitSurvey(1L, 7L, 30L, "[9,1,0,1]");

        assertEquals(400, result.getCode());
        assertTrue(result.getMessage().contains("漏答"));
        verify(pointLedgerRepo, never()).save(any());
    }
}
