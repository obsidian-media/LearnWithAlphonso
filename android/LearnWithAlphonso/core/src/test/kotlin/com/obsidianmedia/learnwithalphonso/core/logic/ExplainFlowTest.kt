package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.net.ExplainErrorKind
import com.obsidianmedia.learnwithalphonso.core.net.ExplainException
import com.obsidianmedia.learnwithalphonso.core.net.Explanation
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ExplainFlowTest {
    private class Backend(var server: String?) : AiConsentBackend {
        override fun currentUserId() = "u1"
        override suspend fun fetch() = server
        override suspend fun set(granted: Boolean) = server
    }

    private class Cache : AiConsentCache {
        override fun read(userId: String): CachedAiConsent? = null
        override fun write(userId: String, grantedAt: String?) {}
    }

    private val answer = Explanation("این یک توضیح است", "fa", ExplainDirection.RTL, cached = false)
    private val request = ExplainRules.message("Hola", "es")!!

    private fun flow(
        scope: TestScope,
        grantedAt: String? = "2026-10-01T00:00:00+00:00",
        session: Boolean = true,
        calls: MutableList<ExplainRequest> = ArrayList(),
        explain: suspend (ExplainRequest) -> Explanation = { answer },
    ): ExplainFlow = ExplainFlow(
        request,
        { r -> calls.add(r); explain(r) },
        AiConsentStore(Backend(grantedAt), Cache()),
        { session },
        scope,
    )

    @Test
    fun `a granted learner gets the explanation`() = runTest {
        val f = flow(this)
        assertEquals(ExplainPhase.Idle, f.phase.value)
        f.run().join()
        assertEquals(ExplainPhase.Shown(answer), f.phase.value)
    }

    @Test
    fun `no consent shows the consent choice and sends nothing, and Not now returns to the chip`() = runTest {
        val calls = ArrayList<ExplainRequest>()
        val f = flow(this, grantedAt = null, calls = calls)
        f.run().join()
        assertEquals(ExplainPhase.NeedsConsent, f.phase.value)
        assertEquals(0, calls.size)
        f.declineConsent()
        assertEquals(ExplainPhase.Idle, f.phase.value)
    }

    @Test
    fun `a signed out learner is told to sign in and nothing is sent`() = runTest {
        val calls = ArrayList<ExplainRequest>()
        val f = flow(this, session = false, calls = calls)
        f.run().join()
        assertEquals(ExplainPhase.Failed(ExplainErrorKind.NOT_SIGNED_IN), f.phase.value)
        assertEquals(0, calls.size)
    }

    @Test
    fun `a failure keeps its kind and a retry can succeed`() = runTest {
        var fail = true
        val f = flow(this, explain = { if (fail) throw ExplainException(ExplainErrorKind.QUOTA_EXCEEDED) else answer })
        f.run().join()
        assertEquals(ExplainPhase.Failed(ExplainErrorKind.QUOTA_EXCEEDED), f.phase.value)
        fail = false
        f.run().join()
        assertEquals(ExplainPhase.Shown(answer), f.phase.value)
    }

    @Test
    fun `an unexpected exception is the generic failure`() = runTest {
        val f = flow(this, explain = { throw IllegalStateException("boom") })
        f.run().join()
        assertEquals(ExplainPhase.Failed(ExplainErrorKind.UNAVAILABLE), f.phase.value)
    }

    @Test
    fun `a server consent refusal opens the consent choice`() = runTest {
        val f = flow(this, explain = { throw ExplainException(ExplainErrorKind.AI_CONSENT_REQUIRED) })
        f.run().join()
        assertEquals(ExplainPhase.NeedsConsent, f.phase.value)
    }

    @Test
    fun `a second tap while loading does not send a second request`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val calls = ArrayList<ExplainRequest>()
        val f = flow(this, calls = calls, explain = { gate.await(); answer })
        val first = f.run()
        f.run()
        runCurrent()
        assertEquals(ExplainPhase.Loading, f.phase.value)
        gate.complete(Unit)
        first.join()
        assertEquals(1, calls.size)
        assertTrue(f.phase.value is ExplainPhase.Shown)
    }

    @Test
    fun `hide returns a shown explanation to the chip`() = runTest {
        val f = flow(this)
        f.run().join()
        f.hide()
        assertEquals(ExplainPhase.Idle, f.phase.value)
    }
}
