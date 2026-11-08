//! Serde helpers that reproduce TypeScript's `undefined` / `null` distinction.

/// `field?: T | null`: outer `None` = key absent (`undefined`), `Some(None)` = `null`.
/// Use with `#[serde(default, skip_serializing_if = "Option::is_none", with = "double_option")]`.
pub mod double_option {
    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    pub fn serialize<S, T>(value: &Option<Option<T>>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
        T: Serialize,
    {
        match value {
            None | Some(None) => serializer.serialize_none(),
            Some(Some(v)) => v.serialize(serializer),
        }
    }

    pub fn deserialize<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
    where
        D: Deserializer<'de>,
        T: Deserialize<'de>,
    {
        Option::<T>::deserialize(deserializer).map(Some)
    }
}
