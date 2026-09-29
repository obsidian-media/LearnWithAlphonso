package com.obsidianmedia.learnwithalphonso.core.content

import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.JsonContentPolymorphicSerializer
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** CEFR bands in the order the placement exam walks them (src/data/placement.ts). */
val placementOrder: List<String> = listOf("A1", "A2", "B1", "B2", "C1")

/** Mirrors PlacementModels.swift; the JSON "type" field picks the case. */
@Serializable(with = PlacementQuestionSerializer::class)
sealed interface PlacementQuestion {
    val id: String
    val level: String

    @Serializable
    data class MultipleChoice(
        override val id: String,
        override val level: String,
        val prompt: String,
        val choices: List<String>,
        val answer: Int,
    ) : PlacementQuestion

    @Serializable
    data class Listening(
        override val id: String,
        override val level: String,
        val prompt: String,
        val audioText: String,
        val choices: List<String>,
        val answer: String,
    ) : PlacementQuestion

    @Serializable
    data class Translate(
        override val id: String,
        override val level: String,
        val prompt: String,
        val acceptableAnswers: List<String>,
    ) : PlacementQuestion
}

object PlacementQuestionSerializer :
    JsonContentPolymorphicSerializer<PlacementQuestion>(PlacementQuestion::class) {
    override fun selectDeserializer(element: JsonElement): DeserializationStrategy<PlacementQuestion> =
        when (val type = element.jsonObject["type"]?.jsonPrimitive?.contentOrNull) {
            "mc" -> PlacementQuestion.MultipleChoice.serializer()
            "listening" -> PlacementQuestion.Listening.serializer()
            "translate" -> PlacementQuestion.Translate.serializer()
            else -> throw SerializationException("Unknown placement question type: $type")
        }
}
