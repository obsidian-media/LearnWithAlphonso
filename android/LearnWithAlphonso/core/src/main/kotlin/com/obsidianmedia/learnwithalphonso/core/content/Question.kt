package com.obsidianmedia.learnwithalphonso.core.content

import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonContentPolymorphicSerializer
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Mirrors the `Question` union in src/data/curriculum.ts (and
 * CurriculumModels.swift); the JSON "type" field picks the case.
 */
@Serializable(with = QuestionSerializer::class)
sealed interface Question {
    val id: String
    val explanation: String

    @Serializable
    data class MultipleChoice(
        override val id: String,
        val prompt: String,
        val choices: List<String>,
        val answer: Int,
        override val explanation: String,
        val imageKey: String? = null,
        val audioText: String? = null,
    ) : Question

    @Serializable
    data class FillInBlank(
        override val id: String,
        val prompt: String,
        val bank: List<String>,
        val answer: String,
        override val explanation: String,
    ) : Question

    @Serializable
    data class Reorder(
        override val id: String,
        val prompt: String,
        val tokens: List<String>,
        val answer: String,
        override val explanation: String,
    ) : Question

    @Serializable
    data class Listening(
        override val id: String,
        val prompt: String,
        val audioText: String,
        val choices: List<String>,
        val answer: String,
        override val explanation: String,
    ) : Question

    @Serializable
    data class Speak(
        override val id: String,
        val prompt: String,
        val answer: String,
        override val explanation: String,
    ) : Question

    @Serializable
    data class Translate(
        override val id: String,
        val prompt: String,
        val acceptableAnswers: List<String>,
        override val explanation: String,
    ) : Question
}

/**
 * Fails loudly on an unknown type, same reasoning as CurriculumModels.swift:
 * content ships inside the binary and CI fails on drift, so a lenient skip
 * would only ever hide a lesson whose question count no longer matches what
 * the server expects in complete-lesson.
 */
object QuestionSerializer : JsonContentPolymorphicSerializer<Question>(Question::class) {
    override fun selectDeserializer(element: JsonElement): DeserializationStrategy<Question> =
        when (val type = element.jsonObject["type"]?.jsonPrimitive?.contentOrNull) {
            "mc" -> Question.MultipleChoice.serializer()
            "fill" -> Question.FillInBlank.serializer()
            "reorder" -> Question.Reorder.serializer()
            "listening" -> Question.Listening.serializer()
            "speak" -> Question.Speak.serializer()
            "translate" -> Question.Translate.serializer()
            else -> throw SerializationException("Unknown question type: $type")
        }
}

/** The one Json configuration every bundled-content and wire model uses. */
object ContentJson {
    val json: Json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }
}
