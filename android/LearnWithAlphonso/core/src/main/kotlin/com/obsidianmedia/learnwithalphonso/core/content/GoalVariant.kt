package com.obsidianmedia.learnwithalphonso.core.content

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull

/**
 * Goal-flavoured question variants (src/lib/goal-variants.ts is the source of the rules; GoalVariants.swift and this
 * file mirror them). A question may carry `goalVariants`: the same question (same id, type, skill, grammar point and
 * answer shape) written for a learner's goal. Lesson ids, question ids, counts and order never change, so progress
 * and reviews are untouched, and a build that predates the field simply shows the base question.
 *
 * What a variant overrides. `answer` is an index for a multiple-choice question and text for the others, so it
 * decodes into whichever it is.
 */
@Serializable(with = GoalVariantSerializer::class)
data class GoalVariant(
    val prompt: String? = null,
    val choices: List<String>? = null,
    val answerIndex: Int? = null,
    val answerText: String? = null,
    val bank: List<String>? = null,
    val acceptableAnswers: List<String>? = null,
    val explanation: String? = null,
    val audioText: String? = null,
)

@Serializable
private data class GoalVariantWire(
    val prompt: String? = null,
    val choices: List<String>? = null,
    val answer: JsonElement? = null,
    val bank: List<String>? = null,
    val acceptableAnswers: List<String>? = null,
    val explanation: String? = null,
    val audioText: String? = null,
)

object GoalVariantSerializer : KSerializer<GoalVariant> {
    override val descriptor: SerialDescriptor = GoalVariantWire.serializer().descriptor

    override fun deserialize(decoder: Decoder): GoalVariant {
        val w = decoder.decodeSerializableValue(GoalVariantWire.serializer())
        val answer = w.answer as? JsonPrimitive
        val index = answer?.takeUnless { it.isString }?.intOrNull
        return GoalVariant(
            prompt = w.prompt,
            choices = w.choices,
            answerIndex = index,
            answerText = if (index == null) answer?.contentOrNull else null,
            bank = w.bank,
            acceptableAnswers = w.acceptableAnswers,
            explanation = w.explanation,
            audioText = w.audioText,
        )
    }

    override fun serialize(encoder: Encoder, value: GoalVariant) {
        val answer: JsonElement? = value.answerIndex?.let { JsonPrimitive(it) }
            ?: value.answerText?.let { JsonPrimitive(it) }
        encoder.encodeSerializableValue(
            GoalVariantWire.serializer(),
            GoalVariantWire(
                value.prompt, value.choices, answer ?: JsonNull, value.bank, value.acceptableAnswers,
                value.explanation, value.audioText,
            ),
        )
    }
}

/** The question's variants by goal, null when it has none. */
val Question.goalVariants: Map<String, GoalVariant>?
    get() = when (this) {
        is Question.MultipleChoice -> goalVariants
        is Question.FillInBlank -> goalVariants
        is Question.Listening -> goalVariants
        is Question.Speak -> goalVariants
        is Question.Translate -> goalVariants
        is Question.Reorder -> null
    }

/**
 * What the player shows a learner with this goal: the variant laid over the question when it has one for the goal,
 * else the question itself. Apply it before any shuffling, as the web does.
 */
fun Question.resolveForGoal(goal: String?): Question {
    val variant = if (goal == null) null else goalVariants?.get(goal)
    return if (variant == null) this else applying(variant)
}

/** Whether the question has a version written for this goal (the "For your goal" tag). */
fun Question.hasVariantForGoal(goal: String?): Boolean = goal != null && goalVariants?.containsKey(goal) == true

/**
 * The version the learner was shown, named by the goal the client sends with its answer (`variantGoal`; null for the
 * base question, which is all a build that predates variants ever shows). Null when the question has no version for
 * that goal. Grading accepts the base and THIS version only, never another goal's.
 */
fun Question.shownVersion(variantGoal: String?): Question? {
    val variant = if (variantGoal == null) null else goalVariants?.get(variantGoal)
    return if (variant == null) null else applying(variant)
}

/**
 * The variant's fields laid over this question. The variants stay on the result so grading still sees them, and a
 * variant with a different answer drops the base answer's vocab card fields.
 */
private fun Question.applying(v: GoalVariant): Question = when (this) {
    is Question.MultipleChoice -> {
        val newChoices = v.choices ?: choices
        val newAnswer = v.answerIndex ?: answer
        val same = newChoices.getOrNull(newAnswer) != null && newChoices.getOrNull(newAnswer) == choices.getOrNull(answer)
        copy(
            prompt = v.prompt ?: prompt,
            choices = newChoices,
            answer = newAnswer,
            explanation = v.explanation ?: explanation,
            imageKey = if (same) imageKey else null,
            meaning = if (same) meaning else null,
            example = if (same) example else null,
            term = if (same) term else null,
        )
    }
    is Question.FillInBlank -> {
        val newAnswer = v.answerText ?: answer
        val same = newAnswer == answer
        copy(
            prompt = v.prompt ?: prompt,
            bank = v.bank ?: bank,
            answer = newAnswer,
            explanation = v.explanation ?: explanation,
            meaning = if (same) meaning else null,
            example = if (same) example else null,
            term = if (same) term else null,
        )
    }
    is Question.Listening -> copy(
        prompt = v.prompt ?: prompt,
        audioText = v.audioText ?: audioText,
        choices = v.choices ?: choices,
        answer = v.answerText ?: answer,
        explanation = v.explanation ?: explanation,
    )
    is Question.Speak -> copy(
        prompt = v.prompt ?: prompt,
        answer = v.answerText ?: answer,
        explanation = v.explanation ?: explanation,
    )
    is Question.Translate -> copy(
        prompt = v.prompt ?: prompt,
        acceptableAnswers = v.acceptableAnswers ?: acceptableAnswers,
        explanation = v.explanation ?: explanation,
    )
    is Question.Reorder -> this
}

/** The lesson with every question resolved for the goal. Ids, count and order never change. */
fun Lesson.resolveForGoal(goal: String?): Lesson =
    if (goal == null) this else copy(questions = questions.map { it.resolveForGoal(goal) })

/**
 * How a queued answer remembers which goal-flavoured version it was given. The Room row has no column for it and a new
 * column needs a schema migration, so the goal rides inside the stored answer text as a prefix of control characters,
 * which no learner can type: "\u0001travel\u0001I take a taxi." Rows written before this have no prefix and decode as
 * the base question's answer, which is what those builds showed.
 */
object VariantGoalTag {
    private const val MARK = '\u0001'

    fun encode(text: String, goal: String?): String =
        if (goal.isNullOrEmpty() || goal.contains(MARK)) text else "$MARK$goal$MARK$text"

    fun decode(stored: String): Pair<String, String?> {
        if (!stored.startsWith(MARK)) return stored to null
        val end = stored.indexOf(MARK, 1)
        if (end < 0) return stored to null
        val goal = stored.substring(1, end)
        return stored.substring(end + 1) to goal.ifEmpty { null }
    }
}
