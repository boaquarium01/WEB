function setHeroSpotlightTimestamp(data: Record<string, unknown>) {
  if (data.heroSpotlight === true) {
    data.heroSpotlightActivatedAt = new Date().toISOString();
  } else if (data.heroSpotlight === false) {
    data.heroSpotlightActivatedAt = null;
  }
}

export default {
  beforeCreate(event: { params: { data: Record<string, unknown> } }) {
    setHeroSpotlightTimestamp(event.params.data);
  },
  beforeUpdate(event: { params: { data: Record<string, unknown> } }) {
    if (Object.prototype.hasOwnProperty.call(event.params.data, 'heroSpotlight')) {
      setHeroSpotlightTimestamp(event.params.data);
    }
  }
};
