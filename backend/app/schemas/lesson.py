from pydantic import BaseModel, Field


class LessonTemplate(BaseModel):
    id: str
    display_name: str
    display_name_en: str
    grammar_focus: str
    description: str = ""
    description_en: str = ""
    example_patterns: list[str] = Field(default_factory=list)
    starter_questions: list[str] = Field(default_factory=list)
    error_hints: list[str] = Field(default_factory=list)
    kid_friendly_rule: str = ""
    grade_range: list[int] = Field(default_factory=lambda: [2, 5])


class LessonCustom(BaseModel):
    display_name: str
    grammar_focus: str
    description: str = ""
    description_en: str = ""
    example_patterns: list[str] = Field(default_factory=list)
    starter_questions: list[str] = Field(default_factory=list)
    error_hints: list[str] = Field(default_factory=list)
    kid_friendly_rule: str = ""

    def to_template(self, lesson_id: str = "custom") -> LessonTemplate:
        return LessonTemplate(
            id=lesson_id,
            display_name=self.display_name,
            display_name_en=self.grammar_focus,
            grammar_focus=self.grammar_focus,
            description=self.description,
            description_en=self.description_en or self.description,
            example_patterns=self.example_patterns,
            starter_questions=self.starter_questions,
            error_hints=self.error_hints,
            kid_friendly_rule=self.kid_friendly_rule,
        )


class LessonSummary(BaseModel):
    id: str
    display_name: str
    display_name_en: str
