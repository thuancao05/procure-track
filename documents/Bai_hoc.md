1. Local chạy được thì chưa chắc gì lên môi trường sẽ chạy được, 
 Vì local và production dùng hai runtime khác nhau:
- Local backend chạy bằng Next.js/Node, parser request.formData() thường xử lý dễ hơn dù header chưa hoàn toàn chuẩn.
- Production chạy trên Cloudflare Workers, parser Web API nghiêm ngặt hơn.


2. Git Action CI/CD dùng file yml để chỉnh theo nhu cầu

3. Supabase cho host online free và có cơ thế xác thực user tiện lợi

4. Hiểu sâu hơn về các Client- Sever hoạt động

5. Có thêm góc nhìn của 1 người muốn build product, thì thực sự việc thay đổi và phát triển muốn thay đổi liên tục

6. 