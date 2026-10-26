{{importBlock}}
{{basePathBlock}}
export const {{nameCamel}}Service = {
  /**
   * Fetch list of {{name}} resources.
   */
  async get({{getParamDef}}) {
{{getMethodBody}}
  },

  /**
   * Fetch a single {{name}} by ID.
   */
  async getById(id) {
{{getByIdMethodBody}}
  },

  /**
   * Create a new {{name}}.
   */
  async create(data) {
{{createMethodBody}}
  },

  /**
   * Update an existing {{name}}.
   */
  async update(id, data) {
{{updateMethodBody}}
  },

  /**
   * Delete a {{name}} by ID.
   */
  async delete(id) {
{{deleteMethodBody}}
  },
};
